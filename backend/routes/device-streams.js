// routes/device-streams.js
const express = require('express');
const router = express.Router();
const Database = require('../lib/database');
const { cacheMiddleware, invalidateUserCache } = require('../middleware/cache');
const cache = require('../lib/cache');

// 🔥 장치별 연결된 스트림 목록 조회
router.get('/device/:deviceId/streams', async (req, res) => {
    try {
        const { deviceId } = req.params;
        const userId = req.user.id;
        
        console.log(`📹 장치별 스트림 조회: ${deviceId} by ${req.user.email}`);
        
        // 사용자가 소유한 장치인지 확인
        const deviceCheck = await Database.query(
            'SELECT device_id FROM devices WHERE device_id = $1 AND registered_by = $2',
            [deviceId, userId]
        );
        
        if (deviceCheck.length === 0) {
            return res.status(404).json({
                success: false,
                error: '장치를 찾을 수 없거나 권한이 없습니다.'
            });
        }
        
        // 연결된 스트림 조회
        const streamsQuery = `
            SELECT 
                sd.id as stream_id,
                sd.stream_name,
                sd.description,
                sd.rtsp_url,
                sd.is_active as stream_active,
                sd.created_at as stream_created_at,
                dsc.id as connection_id,
                dsc.display_order,
                dsc.created_at as connected_at,
                dsc.is_active as connection_active
            FROM device_stream_connections dsc
            JOIN stream_devices sd ON dsc.stream_id = sd.id
            WHERE dsc.device_id = $1 
                AND dsc.is_active = true 
                AND sd.user_id = $2
                AND sd.is_active = true
            ORDER BY dsc.display_order ASC, dsc.created_at ASC
        `;
        
        const streams = await Database.query(streamsQuery, [deviceId, userId]);
        
        console.log(`📹 장치 ${deviceId}에 연결된 스트림: ${streams.length}개`);
        
        res.json({
            success: true,
            deviceId: deviceId,
            streams: streams,
            count: streams.length
        });
        
    } catch (error) {
        console.error('Get device streams error:', error);
        res.status(500).json({
            success: false,
            error: '장치 스트림 조회 중 오류가 발생했습니다.'
        });
    }
});

// 🔥 스트림별 연결된 장치 목록 조회
router.get('/stream/:streamId/devices', async (req, res) => {
    try {
        const { streamId } = req.params;
        const userId = req.user.id;
        
        console.log(`📱 스트림별 장치 조회: ${streamId} by ${req.user.email}`);
        
        // 사용자가 소유한 스트림인지 확인
        const streamCheck = await Database.query(
            'SELECT id, stream_name FROM stream_devices WHERE id = $1 AND user_id = $2 AND is_active = true',
            [streamId, userId]
        );
        
        if (streamCheck.length === 0) {
            return res.status(404).json({
                success: false,
                error: '스트림을 찾을 수 없거나 권한이 없습니다.'
            });
        }
        
        // 연결된 장치 조회
        const devicesQuery = `
            SELECT 
                d.device_id,
                d.device_name,
                d.admin_name,
                d.device_location,
                d.created_at as device_created_at,
                d.last_seen_at,
                dsc.id as connection_id,
                dsc.display_order,
                dsc.created_at as connected_at,
                dsc.is_active as connection_active
            FROM device_stream_connections dsc
            JOIN devices d ON dsc.device_id = d.device_id
            WHERE dsc.stream_id = $1 
                AND dsc.is_active = true 
                AND d.registered_by = $2
            ORDER BY dsc.display_order ASC, dsc.created_at ASC
        `;
        
        const devices = await Database.query(devicesQuery, [streamId, userId]);
        
        console.log(`📱 스트림 ${streamId}에 연결된 장치: ${devices.length}개`);
        
        res.json({
            success: true,
            streamId: streamId,
            streamName: streamCheck[0].stream_name,
            devices: devices,
            count: devices.length
        });
        
    } catch (error) {
        console.error('Get stream devices error:', error);
        res.status(500).json({
            success: false,
            error: '스트림 장치 조회 중 오류가 발생했습니다.'
        });
    }
});

// 🔥 스트림-장치 연결 생성
router.post('/connect', async (req, res) => {
    try {
        const { streamId, deviceIds, displayOrders } = req.body;
        const userId = req.user.id;
        
        console.log(`🔗 스트림-장치 연결: 스트림 ${streamId} → 장치들 ${deviceIds}`);
        
        // 입력 검증
        if (!streamId || !Array.isArray(deviceIds) || deviceIds.length === 0) {
            return res.status(400).json({
                success: false,
                error: '스트림 ID와 장치 ID 배열이 필요합니다.'
            });
        }
        
        // 스트림 소유권 확인
        const streamCheck = await Database.query(
            'SELECT id, stream_name FROM stream_devices WHERE id = $1 AND user_id = $2 AND is_active = true',
            [streamId, userId]
        );
        
        if (streamCheck.length === 0) {
            return res.status(404).json({
                success: false,
                error: '스트림을 찾을 수 없거나 권한이 없습니다.'
            });
        }
        
        // 장치 소유권 확인
        const deviceCheck = await Database.query(
            'SELECT device_id FROM devices WHERE device_id = ANY($1) AND registered_by = $2',
            [deviceIds, userId]
        );
        
        if (deviceCheck.length !== deviceIds.length) {
            return res.status(403).json({
                success: false,
                error: '일부 장치에 대한 권한이 없습니다.'
            });
        }
        
        // 트랜잭션 시작
        await Database.query('BEGIN');
        
        try {
            const connections = [];
            
            for (let i = 0; i < deviceIds.length; i++) {
                const deviceId = deviceIds[i];
                const displayOrder = displayOrders && displayOrders[i] ? displayOrders[i] : i;
                
                // 기존 연결 확인 후 생성 또는 업데이트
                const existingConnection = await Database.query(
                    'SELECT id, is_active FROM device_stream_connections WHERE device_id = $1 AND stream_id = $2',
                    [deviceId, streamId]
                );
                
                if (existingConnection.length > 0) {
                    // 기존 연결이 있으면 활성화
                    await Database.query(
                        'UPDATE device_stream_connections SET is_active = true, display_order = $1 WHERE id = $2',
                        [displayOrder, existingConnection[0].id]
                    );
                    
                    connections.push({
                        connectionId: existingConnection[0].id,
                        deviceId: deviceId,
                        action: 'updated'
                    });
                } else {
                    // 새로운 연결 생성
                    const newConnection = await Database.query(
                        'INSERT INTO device_stream_connections (device_id, stream_id, display_order, created_by) VALUES ($1, $2, $3, $4) RETURNING id',
                        [deviceId, streamId, displayOrder, userId]
                    );
                    
                    connections.push({
                        connectionId: newConnection[0].id,
                        deviceId: deviceId,
                        action: 'created'
                    });
                }
            }
            
            await Database.query('COMMIT');
            
            // 캐시 무효화
            await invalidateConnectionCaches(userId, streamId, deviceIds);
            
            console.log(`✅ 스트림-장치 연결 완료: ${connections.length}개 연결`);
            
            res.json({
                success: true,
                message: '스트림과 장치가 성공적으로 연결되었습니다.',
                connections: connections,
                streamId: streamId,
                streamName: streamCheck[0].stream_name
            });
            
        } catch (error) {
            await Database.query('ROLLBACK');
            throw error;
        }
        
    } catch (error) {
        console.error('Connect stream to devices error:', error);
        res.status(500).json({
            success: false,
            error: '스트림-장치 연결 중 오류가 발생했습니다.'
        });
    }
});

// 🔥 스트림-장치 연결 해제
router.post('/disconnect', async (req, res) => {
    try {
        const { streamId, deviceIds } = req.body;
        const userId = req.user.id;
        
        console.log(`🔌 스트림-장치 연결 해제: 스트림 ${streamId} × 장치들 ${deviceIds}`);
        
        // 입력 검증
        if (!streamId || !Array.isArray(deviceIds) || deviceIds.length === 0) {
            return res.status(400).json({
                success: false,
                error: '스트림 ID와 장치 ID 배열이 필요합니다.'
            });
        }
        
        // 연결 해제 (소프트 삭제)
        const result = await Database.query(
            `UPDATE device_stream_connections 
             SET is_active = false 
             WHERE stream_id = $1 AND device_id = ANY($2) AND created_by = $3
             RETURNING id, device_id`,
            [streamId, deviceIds, userId]
        );
        
        // 캐시 무효화
        await invalidateConnectionCaches(userId, streamId, deviceIds);
        
        console.log(`✅ 스트림-장치 연결 해제 완료: ${result.length}개 해제`);
        
        res.json({
            success: true,
            message: '스트림과 장치 연결이 성공적으로 해제되었습니다.',
            disconnectedCount: result.length,
            disconnectedConnections: result
        });
        
    } catch (error) {
        console.error('Disconnect stream from devices error:', error);
        res.status(500).json({
            success: false,
            error: '스트림-장치 연결 해제 중 오류가 발생했습니다.'
        });
    }
});

// 🔥 그룹별 모든 스트림 조회 (통합 뷰어용)
router.get('/group/:groupId/streams', cacheMiddleware(60, (req) => `group:streams:${req.params.groupId}:${req.user.id}`), async (req, res) => {
    try {
        const { groupId } = req.params;
        const userId = req.user.id;
        
        console.log(`📹 그룹별 스트림 조회: ${groupId} by ${req.user.email}`);
        
        // 그룹 소유권 확인
        const groupCheck = await Database.query(
            'SELECT group_id, group_name FROM device_groups WHERE group_id = $1 AND created_by = $2',
            [groupId, userId]
        );
        
        if (groupCheck.length === 0) {
            return res.status(404).json({
                success: false,
                error: '그룹을 찾을 수 없거나 권한이 없습니다.'
            });
        }
        
        // 그룹에 속한 모든 장치의 스트림 조회
        const streamsQuery = `
            SELECT DISTINCT
                sd.id as stream_id,
                sd.stream_name,
                sd.description,
                sd.rtsp_url,
                sd.is_active as stream_active,
                sd.created_at as stream_created_at,
                dsc.id as connection_id,
                dsc.device_id,
                d.device_name,
                dsc.display_order,
                dsc.created_at as connected_at
            FROM device_group_members dgm
            JOIN devices d ON dgm.device_id = d.device_id
            JOIN device_stream_connections dsc ON d.device_id = dsc.device_id
            JOIN stream_devices sd ON dsc.stream_id = sd.id
            WHERE dgm.group_id = $1 
                AND dsc.is_active = true 
                AND sd.user_id = $2
                AND sd.is_active = true
                AND d.registered_by = $2
            ORDER BY dsc.device_id, dsc.display_order ASC, dsc.created_at ASC
        `;
        
        const streams = await Database.query(streamsQuery, [groupId, userId]);
        
        // 장치별로 그룹화
        const streamsByDevice = {};
        const uniqueStreams = new Map();
        
        streams.forEach(stream => {
            // 장치별 그룹화
            if (!streamsByDevice[stream.device_id]) {
                streamsByDevice[stream.device_id] = {
                    device_id: stream.device_id,
                    device_name: stream.device_name,
                    streams: []
                };
            }
            streamsByDevice[stream.device_id].streams.push(stream);
            
            // 고유한 스트림 목록 (중복 제거)
            if (!uniqueStreams.has(stream.stream_id)) {
                uniqueStreams.set(stream.stream_id, {
                    stream_id: stream.stream_id,
                    stream_name: stream.stream_name,
                    description: stream.description,
                    rtsp_url: stream.rtsp_url,
                    stream_active: stream.stream_active,
                    stream_created_at: stream.stream_created_at,
                    connected_devices: []
                });
            }
            
            uniqueStreams.get(stream.stream_id).connected_devices.push({
                device_id: stream.device_id,
                device_name: stream.device_name,
                connection_id: stream.connection_id,
                display_order: stream.display_order
            });
        });
        
        console.log(`📹 그룹 ${groupId}의 스트림: 장치 ${Object.keys(streamsByDevice).length}개, 고유 스트림 ${uniqueStreams.size}개`);
        
        res.json({
            success: true,
            groupId: groupId,
            groupName: groupCheck[0].group_name,
            streamsByDevice: Object.values(streamsByDevice),
            uniqueStreams: Array.from(uniqueStreams.values()),
            totalDevices: Object.keys(streamsByDevice).length,
            totalUniqueStreams: uniqueStreams.size,
            totalConnections: streams.length
        });
        
    } catch (error) {
        console.error('Get group streams error:', error);
        res.status(500).json({
            success: false,
            error: '그룹 스트림 조회 중 오류가 발생했습니다.'
        });
    }
});

// 🔥 사용자의 모든 스트림과 연결 상태 조회
router.get('/connections/overview', cacheMiddleware(120, (req) => `connections:overview:${req.user.id}`), async (req, res) => {
    try {
        const userId = req.user.id;
        
        console.log(`🔍 연결 상태 전체 조회: ${req.user.email}`);
        
        // 사용자의 모든 스트림과 연결 정보 조회
        const connectionsQuery = `
            SELECT 
                sd.id as stream_id,
                sd.stream_name,
                sd.description,
                sd.is_active as stream_active,
                sd.created_at as stream_created_at,
                COUNT(dsc.id) FILTER (WHERE dsc.is_active = true) as connected_devices_count,
                ARRAY_AGG(
                    CASE 
                        WHEN dsc.is_active = true 
                        THEN json_build_object(
                            'device_id', dsc.device_id,
                            'device_name', d.device_name,
                            'connection_id', dsc.id,
                            'display_order', dsc.display_order,
                            'connected_at', dsc.created_at
                        )
                        ELSE NULL 
                    END
                ) FILTER (WHERE dsc.is_active = true) as connected_devices
            FROM stream_devices sd
            LEFT JOIN device_stream_connections dsc ON sd.id = dsc.stream_id AND dsc.is_active = true
            LEFT JOIN devices d ON dsc.device_id = d.device_id AND d.registered_by = $1
            WHERE sd.user_id = $1 AND sd.is_active = true
            GROUP BY sd.id, sd.stream_name, sd.description, sd.is_active, sd.created_at
            ORDER BY sd.created_at DESC
        `;
        
        const connections = await Database.query(connectionsQuery, [userId]);
        
        // NULL 값 필터링
        const processedConnections = connections.map(conn => ({
            ...conn,
            connected_devices: (conn.connected_devices || []).filter(device => device !== null)
        }));
        
        // 통계 계산
        const stats = {
            totalStreams: processedConnections.length,
            connectedStreams: processedConnections.filter(s => s.connected_devices_count > 0).length,
            standaloneStreams: processedConnections.filter(s => s.connected_devices_count === 0).length,
            totalConnections: processedConnections.reduce((sum, s) => sum + s.connected_devices_count, 0)
        };
        
        console.log(`🔍 연결 통계:`, stats);
        
        res.json({
            success: true,
            connections: processedConnections,
            stats: stats
        });
        
    } catch (error) {
        console.error('Get connections overview error:', error);
        res.status(500).json({
            success: false,
            error: '연결 상태 조회 중 오류가 발생했습니다.'
        });
    }
});

// 🔥 캐시 무효화 헬퍼 함수
async function invalidateConnectionCaches(userId, streamId, deviceIds) {
    const cachePromises = [
        invalidateUserCache(userId, 'devices*'),
        invalidateUserCache(userId, 'groups*'),
        invalidateUserCache(userId, 'connections*')
    ];
    
    if (cache.del) {
        // 개별 캐시 삭제
        cachePromises.push(
            cache.del(`connections:overview:${userId}`),
            cache.del(`stream:devices:${streamId}:${userId}`),
            ...deviceIds.map(deviceId => cache.del(`device:streams:${deviceId}:${userId}`))
        );
    }
    
    await Promise.all(cachePromises.filter(Boolean));
}

module.exports = router;