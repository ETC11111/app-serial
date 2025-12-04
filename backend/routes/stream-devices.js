// routes/stream-devices.js - 수정된 버전
const express = require('express');
const router = express.Router();
const Database = require('../lib/database'); // 기존 Database 클래스 사용

// 사용자의 스트림 디바이스 목록 조회
router.get('/', async (req, res) => {
    try {
        const userId = req.user.id;
        
        const streams = await Database.query(
            'SELECT * FROM stream_devices WHERE user_id = $1 AND is_active = true ORDER BY created_at DESC',
            [userId]
        );
        
        res.json({
            success: true,
            streams: streams
        });
    } catch (error) {
        console.error('스트림 목록 조회 오류:', error);
        res.status(500).json({
            success: false,
            error: '스트림 목록을 불러오는데 실패했습니다.'
        });
    }
});

// 새 스트림 디바이스 추가
router.post('/', async (req, res) => {
    try {
        const userId = req.user.id;
        const { stream_name, rtsp_url, description, deviceIds } = req.body; // 🔥 deviceIds 추가
        
        // 입력값 검증
        if (!stream_name || !rtsp_url) {
            return res.status(400).json({
                success: false,
                error: '스트림 이름과 RTSP URL은 필수입니다.'
            });
        }
        
        // RTSP URL 형식 검증
        if (!rtsp_url.startsWith('rtsp://')) {
            return res.status(400).json({
                success: false,
                error: '올바른 RTSP URL 형식이 아닙니다. (rtsp://로 시작해야 합니다)'
            });
        }
        
        const streams = await Database.query(
            'INSERT INTO stream_devices (user_id, stream_name, rtsp_url, description) VALUES ($1, $2, $3, $4) RETURNING *',
            [userId, stream_name, rtsp_url, description]
        );
        
        const newStream = streams[0];
        
        // 🔥 장치 연결이 요청된 경우 처리
        if (deviceIds && Array.isArray(deviceIds) && deviceIds.length > 0) {
            // 장치 소유권 확인
            const deviceCheck = await Database.query(
                'SELECT device_id FROM devices WHERE device_id = ANY($1) AND registered_by = $2',
                [deviceIds, userId]
            );
            
            if (deviceCheck.length === deviceIds.length) {
                // 모든 장치가 유효한 경우 연결 생성
                for (let i = 0; i < deviceIds.length; i++) {
                    await Database.query(
                        'INSERT INTO device_stream_connections (device_id, stream_id, display_order, created_by) VALUES ($1, $2, $3, $4)',
                        [deviceIds[i], newStream.id, i, userId]
                    );
                }
                
                console.log(`✅ 스트림 생성 및 ${deviceIds.length}개 장치 연결 완료`);
            }
        }
        
        res.json({
            success: true,
            message: '스트림이 성공적으로 추가되었습니다.',
            stream: newStream,
            connectedDevices: deviceIds || []
        });
    } catch (error) {
        console.error('스트림 추가 오류:', error);
        res.status(500).json({
            success: false,
            error: '스트림 추가에 실패했습니다.'
        });
    }
});

// 🔥 스트림과 연결 가능한 장치 목록 조회
router.get('/available-devices', async (req, res) => {
    try {
        const userId = req.user.id;
        
        console.log(`📱 연결 가능한 장치 목록: ${req.user.email}`);
        
        const devicesQuery = `
            SELECT 
                d.device_id,
                d.device_name,
                d.admin_name,
                d.device_location,
                d.created_at,
                d.last_seen_at,
                COUNT(dsc.id) FILTER (WHERE dsc.is_active = true) as connected_streams_count
            FROM devices d
            LEFT JOIN device_stream_connections dsc ON d.device_id = dsc.device_id AND dsc.is_active = true
            WHERE d.registered_by = $1
            GROUP BY d.device_id, d.device_name, d.admin_name, d.device_location, d.created_at, d.last_seen_at
            ORDER BY d.device_name ASC
        `;
        
        const devices = await Database.query(devicesQuery, [userId]);
        
        res.json({
            success: true,
            devices: devices
        });
        
    } catch (error) {
        console.error('Get available devices error:', error);
        res.status(500).json({
            success: false,
            error: '장치 목록 조회 중 오류가 발생했습니다.'
        });
    }
});

// 스트림 디바이스 수정
router.put('/:id', async (req, res) => {
    try {
        const userId = req.user.id;
        const streamId = req.params.id;
        const { stream_name, rtsp_url, description } = req.body;
        
        const streams = await Database.query(
            'UPDATE stream_devices SET stream_name = $1, rtsp_url = $2, description = $3, updated_at = NOW() WHERE id = $4 AND user_id = $5 RETURNING *',
            [stream_name, rtsp_url, description, streamId, userId]
        );
        
        if (streams.length === 0) {
            return res.status(404).json({
                success: false,
                error: '스트림을 찾을 수 없습니다.'
            });
        }
        
        res.json({
            success: true,
            message: '스트림이 성공적으로 수정되었습니다.',
            stream: streams[0]
        });
    } catch (error) {
        console.error('스트림 수정 오류:', error);
        res.status(500).json({
            success: false,
            error: '스트림 수정에 실패했습니다.'
        });
    }
});

// 스트림 디바이스 삭제 (소프트 삭제)
router.delete('/:id', async (req, res) => {
    try {
        const userId = req.user.id;
        const streamId = req.params.id;
        
        const streams = await Database.query(
            'UPDATE stream_devices SET is_active = false, updated_at = NOW() WHERE id = $1 AND user_id = $2 RETURNING *',
            [streamId, userId]
        );
        
        if (streams.length === 0) {
            return res.status(404).json({
                success: false,
                error: '스트림을 찾을 수 없습니다.'
            });
        }
        
        // 활성 스트림이 있다면 정지
        const streamInfo = global.activeStreams.get(streamId);
        if (streamInfo && streamInfo.process) {
            streamInfo.process.kill('SIGKILL');
            global.activeStreams.delete(streamId);
            console.log(`스트림 ${streamId} 삭제로 인해 정지됨`);
        }
        
        // 🔥 관련 연결도 비활성화
        await Database.query(
            'UPDATE device_stream_connections SET is_active = false WHERE stream_id = $1',
            [streamId]
        );
        
        res.json({
            success: true,
            message: '스트림이 성공적으로 삭제되었습니다.'
        });
    } catch (error) {
        console.error('스트림 삭제 오류:', error);
        res.status(500).json({
            success: false,
            error: '스트림 삭제에 실패했습니다.'
        });
    }
});

// 특정 스트림 상세 정보 조회
router.get('/:id', async (req, res) => {
    try {
        const userId = req.user.id;
        const streamId = req.params.id;
        
        const streams = await Database.query(
            'SELECT * FROM stream_devices WHERE id = $1 AND user_id = $2 AND is_active = true',
            [streamId, userId]
        );
        
        if (streams.length === 0) {
            return res.status(404).json({
                success: false,
                error: '스트림을 찾을 수 없습니다.'
            });
        }
        
        // 🔥 연결된 장치 정보도 함께 조회
        const connectedDevices = await Database.query(
            `SELECT d.device_id, d.device_name, dsc.display_order
             FROM device_stream_connections dsc
             JOIN devices d ON dsc.device_id = d.device_id
             WHERE dsc.stream_id = $1 AND dsc.is_active = true AND d.registered_by = $2
             ORDER BY dsc.display_order ASC`,
            [streamId, userId]
        );
        
        res.json({
            success: true,
            stream: {
                ...streams[0],
                connected_devices: connectedDevices
            }
        });
    } catch (error) {
        console.error('스트림 조회 오류:', error);
        res.status(500).json({
            success: false,
            error: '스트림 조회에 실패했습니다.'
        });
    }
});

module.exports = router;