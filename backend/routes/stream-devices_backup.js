// routes/stream-devices.js
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
        const { stream_name, rtsp_url, description } = req.body;
        
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
        
        res.json({
            success: true,
            message: '스트림이 성공적으로 추가되었습니다.',
            stream: streams[0]
        });
    } catch (error) {
        console.error('스트림 추가 오류:', error);
        res.status(500).json({
            success: false,
            error: '스트림 추가에 실패했습니다.'
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
        
        res.json({
            success: true,
            stream: streams[0]
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