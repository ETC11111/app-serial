// routes/filters.js

const express = require('express');
const Database = require('../lib/database');
const { authenticateToken } = require('../middleware/auth');
const { cacheMiddleware, invalidateUserCache } = require('../middleware/cache');
const cache = require('../lib/cache');

const router = express.Router();

// 🔥 센서 차트 필터 조회 API
router.get('/:deviceId/sensor-chart', authenticateToken, cacheMiddleware(300, (req) => `filter:sensor-chart:${req.params.deviceId}:${req.user.id}`), async (req, res) => {
  try {
    const { deviceId } = req.params;
    const userId = req.user.id;
    
    console.log(`📊 센서 차트 필터 조회: ${deviceId} by user ${req.user.email}`);
    
    // 사용자가 소유한 장치인지 확인
    const deviceCheck = await Database.query(
      'SELECT device_id FROM devices WHERE device_id = $1 AND registered_by = $2',
      [deviceId, userId]
    );
    
    if (deviceCheck.length === 0) {
      return res.status(404).json({
        success: false,
        error: '해당 장치에 대한 권한이 없거나 장치를 찾을 수 없습니다.'
      });
    }
    
    // 필터 데이터 조회
    const filterData = await Database.query(
      `SELECT selected_sensor_types, selected_bar_values, mobile_chart_tab, updated_at
       FROM user_device_filters 
       WHERE user_id = $1 AND device_id = $2`,
      [userId, deviceId]
    );
    
    if (filterData.length === 0) {
      console.log(`📊 필터 없음: ${deviceId}`);
      return res.json({
        success: true,
        hasFilter: false,
        message: '저장된 필터가 없습니다.',
        defaultFilter: {
          selectedSensorTypes: [],
          selectedBarValues: [],
          mobileChartTab: 'line'
        }
      });
    }
    
    const filter = filterData[0];
    console.log(`📊 필터 조회 성공: ${deviceId}`);
    
    res.json({
      success: true,
      hasFilter: true,
      filter: {
        selectedSensorTypes: filter.selected_sensor_types || [],
        selectedBarValues: filter.selected_bar_values || [],
        mobileChartTab: filter.mobile_chart_tab || 'line'
      },
      lastUpdated: filter.updated_at,
      message: '저장된 필터를 불러왔습니다.'
    });
    
  } catch (error) {
    console.error('Get sensor chart filter error:', error);
    res.status(500).json({
      success: false,
      error: '필터 조회 중 오류가 발생했습니다.'
    });
  }
});

// 🔥 센서 차트 필터 저장/업데이트 API
router.post('/:deviceId/sensor-chart', authenticateToken, async (req, res) => {
  try {
    const { deviceId } = req.params;
    const { selectedSensorTypes, selectedBarValues, mobileChartTab } = req.body;
    const userId = req.user.id;
    
    console.log(`💾 센서 차트 필터 저장: ${deviceId} by user ${req.user.email}`);
    
    // 사용자가 소유한 장치인지 확인
    const deviceCheck = await Database.query(
      'SELECT device_id FROM devices WHERE device_id = $1 AND registered_by = $2',
      [deviceId, userId]
    );
    
    if (deviceCheck.length === 0) {
      return res.status(404).json({
        success: false,
        error: '해당 장치에 대한 권한이 없거나 장치를 찾을 수 없습니다.'
      });
    }
    
    // 🔥 행이 존재하는지 확인
    const existingFilter = await Database.query(
      'SELECT id FROM user_device_filters WHERE user_id = $1 AND device_id = $2',
      [userId, deviceId]
    );
    
    let result;
    let isNewFilter = false;
    
    if (existingFilter.length === 0) {
      // 🔥 새 행 생성 - 센서 차트 필드만 설정
      result = await Database.query(
        `INSERT INTO user_device_filters (
          user_id, device_id, 
          selected_sensor_types, selected_bar_values, mobile_chart_tab,
          created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
        RETURNING id, created_at, updated_at`,
        [
          userId, deviceId,
          selectedSensorTypes || [],
          selectedBarValues || [],
          mobileChartTab || 'line'
        ]
      );
      isNewFilter = true;
    } else {
      // 🔥 기존 행 업데이트 - 센서 차트 필드만 업데이트
      const setParts = [];
      const values = [userId, deviceId];
      let valueIndex = 3;
      
      if (selectedSensorTypes !== undefined) {
        setParts.push(`selected_sensor_types = $${valueIndex++}`);
        values.push(selectedSensorTypes);
      }
      if (selectedBarValues !== undefined) {
        setParts.push(`selected_bar_values = $${valueIndex++}`);
        values.push(selectedBarValues);
      }
      if (mobileChartTab !== undefined) {
        setParts.push(`mobile_chart_tab = $${valueIndex++}`);
        values.push(mobileChartTab);
      }
      
      if (setParts.length > 0) {
        setParts.push('updated_at = NOW()');
        
        result = await Database.query(
          `UPDATE user_device_filters SET ${setParts.join(', ')}
           WHERE user_id = $1 AND device_id = $2
           RETURNING id, created_at, updated_at`,
          values
        );
      }
    }
    
    const filterResult = result[0];
    console.log(`✅ 센서 차트 필터 ${isNewFilter ? '생성' : '업데이트'} 완료: ${deviceId}`);
    
    // 캐시 무효화
    await invalidateUserCache(userId, 'filter*');
    if (cache.del) {
      await cache.del(`filter:sensor-chart:${deviceId}:${userId}`);
    }
    
    res.json({
      success: true,
      isNewFilter: isNewFilter,
      message: `센서 차트 필터가 성공적으로 ${isNewFilter ? '생성' : '업데이트'}되었습니다.`,
      savedAt: filterResult.updated_at
    });
    
  } catch (error) {
    console.error('Save sensor chart filter error:', error);
    res.status(500).json({
      success: false,
      error: '필터 저장 중 오류가 발생했습니다.'
    });
  }
});

// 🔥 평면도 필터 조회 API
router.get('/:deviceId/floor-plan', authenticateToken, cacheMiddleware(300, (req) => `filter:floor-plan:${req.params.deviceId}:${req.user.id}`), async (req, res) => {
  try {
    const { deviceId } = req.params;
    const userId = req.user.id;
    
    console.log(`🏠 평면도 필터 조회: ${deviceId} by user ${req.user.email}`);
    
    // 사용자가 소유한 장치인지 확인
    const deviceCheck = await Database.query(
      'SELECT device_id FROM devices WHERE device_id = $1 AND registered_by = $2',
      [deviceId, userId]
    );
    
    if (deviceCheck.length === 0) {
      return res.status(404).json({
        success: false,
        error: '해당 장치에 대한 권한이 없거나 장치를 찾을 수 없습니다.'
      });
    }
    
    // 필터 데이터 조회
    const filterData = await Database.query(
      `SELECT greenhouse_width, greenhouse_height, greenhouse_length, greenhouse_type, greenhouse_name,
              floor_plan_view_zoom, floor_plan_view_center_x, floor_plan_view_center_y,
              floor_plan_show_grid, floor_plan_show_labels, floor_plan_selected_sensor, updated_at
       FROM user_device_filters 
       WHERE user_id = $1 AND device_id = $2`,
      [userId, deviceId]
    );
    
    if (filterData.length === 0) {
      console.log(`🏠 평면도 필터 없음: ${deviceId}`);
      return res.json({
        success: true,
        hasFilter: false,
        message: '저장된 평면도 설정이 없습니다.',
        defaultFilter: {
          greenhouseConfig: {
            width: 20,
            height: 8,
            length: 30,
            type: 'glass',
            name: '온실'
          },
          selectedSensor: '',
          viewSettings: {
            zoom: 1,
            centerX: 50,
            centerY: 50,
            showGrid: true,
            showLabels: true
          }
        }
      });
    }
    
    const filter = filterData[0];
    console.log(`🏠 평면도 필터 조회 성공: ${deviceId}`);
    
    res.json({
      success: true,
      hasFilter: true,
      filter: {
        greenhouseConfig: {
          width: filter.greenhouse_width || 20,
          height: filter.greenhouse_height || 8,
          length: filter.greenhouse_length || 30,
          type: filter.greenhouse_type || 'glass',
          name: filter.greenhouse_name || '온실'  // 🔥 name 필드 추가
        },
        selectedSensor: filter.floor_plan_selected_sensor || '',
        viewSettings: {
          zoom: filter.floor_plan_view_zoom || 1,
          centerX: filter.floor_plan_view_center_x || 50,
          centerY: filter.floor_plan_view_center_y || 50,
          showGrid: filter.floor_plan_show_grid !== false,
          showLabels: filter.floor_plan_show_labels !== false
        }
      },
      lastUpdated: filter.updated_at,
      message: '저장된 평면도 설정을 불러왔습니다.'
    });
    
  } catch (error) {
    console.error('Get floor plan filter error:', error);
    res.status(500).json({
      success: false,
      error: '평면도 필터 조회 중 오류가 발생했습니다.'
    });
  }
});

// 🔥 평면도 필터 저장/업데이트 API
router.post('/:deviceId/floor-plan', authenticateToken, async (req, res) => {
  try {
    const { deviceId } = req.params;
    const { greenhouseConfig, selectedSensor, viewSettings } = req.body;
    const userId = req.user.id;
    
    console.log(`💾 평면도 필터 저장: ${deviceId} by user ${req.user.email}`);
    
    // 사용자가 소유한 장치인지 확인
    const deviceCheck = await Database.query(
      'SELECT device_id FROM devices WHERE device_id = $1 AND registered_by = $2',
      [deviceId, userId]
    );
    
    if (deviceCheck.length === 0) {
      return res.status(404).json({
        success: false,
        error: '해당 장치에 대한 권한이 없거나 장치를 찾을 수 없습니다.'
      });
    }
    
    // 🔥 행이 존재하는지 확인
    const existingFilter = await Database.query(
      'SELECT id FROM user_device_filters WHERE user_id = $1 AND device_id = $2',
      [userId, deviceId]
    );
    
    let result;
    let isNewFilter = false;
    
    if (existingFilter.length === 0) {
      // 🔥 새 행 생성 - 평면도 필드만 설정
      result = await Database.query(
        `INSERT INTO user_device_filters (
          user_id, device_id,
          greenhouse_width, greenhouse_height, greenhouse_length, greenhouse_type, greenhouse_name,
          floor_plan_view_zoom, floor_plan_view_center_x, floor_plan_view_center_y,
          floor_plan_show_grid, floor_plan_show_labels, floor_plan_selected_sensor,
          created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, NOW(), NOW())
        RETURNING id, created_at, updated_at`,
        [
          userId, deviceId,
          greenhouseConfig?.width || 20,
          greenhouseConfig?.height || 8,
          greenhouseConfig?.length || 30,
          greenhouseConfig?.type || 'glass',
          greenhouseConfig?.name || '온실', 
          viewSettings?.zoom || 1.0,
          viewSettings?.centerX || 50,
          viewSettings?.centerY || 50,
          viewSettings?.showGrid !== false,
          viewSettings?.showLabels !== false,
          selectedSensor || null
        ]
      );
      isNewFilter = true;
    } else {
      // 🔥 기존 행 업데이트 - 평면도 필드만 업데이트
      const setParts = [];
      const values = [userId, deviceId];
      let valueIndex = 3;
      
      if (greenhouseConfig?.width !== undefined) {
        setParts.push(`greenhouse_width = $${valueIndex++}`);
        values.push(greenhouseConfig.width);
      }
      if (greenhouseConfig?.height !== undefined) {
        setParts.push(`greenhouse_height = $${valueIndex++}`);
        values.push(greenhouseConfig.height);
      }
      if (greenhouseConfig?.length !== undefined) {
        setParts.push(`greenhouse_length = $${valueIndex++}`);
        values.push(greenhouseConfig.length);
      }
      if (greenhouseConfig?.type !== undefined) {
        setParts.push(`greenhouse_type = $${valueIndex++}`);
        values.push(greenhouseConfig.type);
      }
      // 기존 행 업데이트에도 name 처리 추가
        if (greenhouseConfig?.name !== undefined) {
            setParts.push(`greenhouse_name = $${valueIndex++}`);
            values.push(greenhouseConfig.name);
        }
      if (viewSettings?.zoom !== undefined) {
        setParts.push(`floor_plan_view_zoom = $${valueIndex++}`);
        values.push(viewSettings.zoom);
      }
      if (viewSettings?.centerX !== undefined) {
        setParts.push(`floor_plan_view_center_x = $${valueIndex++}`);
        values.push(viewSettings.centerX);
      }
      if (viewSettings?.centerY !== undefined) {
        setParts.push(`floor_plan_view_center_y = $${valueIndex++}`);
        values.push(viewSettings.centerY);
      }
      if (viewSettings?.showGrid !== undefined) {
        setParts.push(`floor_plan_show_grid = $${valueIndex++}`);
        values.push(viewSettings.showGrid);
      }
      if (viewSettings?.showLabels !== undefined) {
        setParts.push(`floor_plan_show_labels = $${valueIndex++}`);
        values.push(viewSettings.showLabels);
      }
      if (selectedSensor !== undefined) {
        setParts.push(`floor_plan_selected_sensor = $${valueIndex++}`);
        values.push(selectedSensor);
      }
      
      if (setParts.length > 0) {
        setParts.push('updated_at = NOW()');
        
        result = await Database.query(
          `UPDATE user_device_filters SET ${setParts.join(', ')}
           WHERE user_id = $1 AND device_id = $2
           RETURNING id, created_at, updated_at`,
          values
        );
      }
    }
    
    const filterResult = result[0];
    console.log(`✅ 평면도 필터 ${isNewFilter ? '생성' : '업데이트'} 완료: ${deviceId}`);
    
    // 캐시 무효화
    await invalidateUserCache(userId, 'filter*');
    if (cache.del) {
      await cache.del(`filter:floor-plan:${deviceId}:${userId}`);
    }
    
    res.json({
      success: true,
      isNewFilter: isNewFilter,
      message: `평면도 설정이 성공적으로 ${isNewFilter ? '생성' : '업데이트'}되었습니다.`,
      savedAt: filterResult.updated_at
    });
    
  } catch (error) {
    console.error('Save floor plan filter error:', error);
    res.status(500).json({
      success: false,
      error: '평면도 필터 저장 중 오류가 발생했습니다.'
    });
  }
});

// 🔥 측면도 필터 조회 API
router.get('/:deviceId/side-view', authenticateToken, cacheMiddleware(300, (req) => `filter:side-view:${req.params.deviceId}:${req.user.id}`), async (req, res) => {
  try {
    const { deviceId } = req.params;
    const userId = req.user.id;
    
    console.log(`📐 측면도 필터 조회: ${deviceId} by user ${req.user.email}`);
    
    // 사용자가 소유한 장치인지 확인
    const deviceCheck = await Database.query(
      'SELECT device_id FROM devices WHERE device_id = $1 AND registered_by = $2',
      [deviceId, userId]
    );
    
    if (deviceCheck.length === 0) {
      return res.status(404).json({
        success: false,
        error: '해당 장치에 대한 권한이 없거나 장치를 찾을 수 없습니다.'
      });
    }
    
    // 필터 데이터 조회
    const filterData = await Database.query(
      `SELECT greenhouse_width, greenhouse_height, greenhouse_type,
              side_view_show_grid, side_view_show_labels, side_view_show_height_guides, 
              side_view_show_ground_line, side_view_selected_sensor, updated_at
       FROM user_device_filters 
       WHERE user_id = $1 AND device_id = $2`,
      [userId, deviceId]
    );
    
    if (filterData.length === 0) {
      console.log(`📐 측면도 필터 없음: ${deviceId}`);
      return res.json({
        success: true,
        hasFilter: false,
        message: '저장된 측면도 설정이 없습니다.',
        defaultFilter: {
          greenhouseConfig: {
            width: 20,
            height: 8,
            type: 'glass'
          },
          selectedSensor: '',
          viewSettings: {
            showGrid: true,
            showLabels: true,
            showHeightGuides: true,
            showGroundLine: true
          }
        }
      });
    }
    
    const filter = filterData[0];
    console.log(`📐 측면도 필터 조회 성공: ${deviceId}`);
    
    res.json({
      success: true,
      hasFilter: true,
      filter: {
        greenhouseConfig: {
          width: filter.greenhouse_width || 20,
          height: filter.greenhouse_height || 8,
          type: filter.greenhouse_type || 'glass'
        },
        selectedSensor: filter.side_view_selected_sensor || '',
        viewSettings: {
          showGrid: filter.side_view_show_grid !== false,
          showLabels: filter.side_view_show_labels !== false,
          showHeightGuides: filter.side_view_show_height_guides !== false,
          showGroundLine: filter.side_view_show_ground_line !== false
        }
      },
      lastUpdated: filter.updated_at,
      message: '저장된 측면도 설정을 불러왔습니다.'
    });
    
  } catch (error) {
    console.error('Get side view filter error:', error);
    res.status(500).json({
      success: false,
      error: '측면도 필터 조회 중 오류가 발생했습니다.'
    });
  }
});

// 🔥 측면도 필터 저장/업데이트 API
router.post('/:deviceId/side-view', authenticateToken, async (req, res) => {
  try {
    const { deviceId } = req.params;
    const { greenhouseConfig, selectedSensor, viewSettings } = req.body;
    const userId = req.user.id;
    
    console.log(`💾 측면도 필터 저장: ${deviceId} by user ${req.user.email}`);
    
    // 사용자가 소유한 장치인지 확인
    const deviceCheck = await Database.query(
      'SELECT device_id FROM devices WHERE device_id = $1 AND registered_by = $2',
      [deviceId, userId]
    );
    
    if (deviceCheck.length === 0) {
      return res.status(404).json({
        success: false,
        error: '해당 장치에 대한 권한이 없거나 장치를 찾을 수 없습니다.'
      });
    }
    
    // 🔥 행이 존재하는지 확인
    const existingFilter = await Database.query(
      'SELECT id FROM user_device_filters WHERE user_id = $1 AND device_id = $2',
      [userId, deviceId]
    );
    
    let result;
    let isNewFilter = false;
    
    if (existingFilter.length === 0) {
      // 🔥 새 행 생성 - 측면도 필드만 설정 (온실 크기는 공유)
      result = await Database.query(
        `INSERT INTO user_device_filters (
          user_id, device_id,
          greenhouse_width, greenhouse_height, greenhouse_type,
          side_view_show_grid, side_view_show_labels, side_view_show_height_guides, 
          side_view_show_ground_line, side_view_selected_sensor,
          created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW(), NOW())
        RETURNING id, created_at, updated_at`,
        [
          userId, deviceId,
          greenhouseConfig?.width || 20,
          greenhouseConfig?.height || 8,
          greenhouseConfig?.type || 'glass',
          viewSettings?.showGrid !== false,
          viewSettings?.showLabels !== false,
          viewSettings?.showHeightGuides !== false,
          viewSettings?.showGroundLine !== false,
          selectedSensor || null
        ]
      );
      isNewFilter = true;
    } else {
      // 🔥 기존 행 업데이트 - 측면도 필드만 업데이트
      const setParts = [];
      const values = [userId, deviceId];
      let valueIndex = 3;
      
      if (greenhouseConfig?.width !== undefined) {
        setParts.push(`greenhouse_width = $${valueIndex++}`);
        values.push(greenhouseConfig.width);
      }
      if (greenhouseConfig?.height !== undefined) {
        setParts.push(`greenhouse_height = $${valueIndex++}`);
        values.push(greenhouseConfig.height);
      }
      if (greenhouseConfig?.type !== undefined) {
        setParts.push(`greenhouse_type = $${valueIndex++}`);
        values.push(greenhouseConfig.type);
      }
      if (viewSettings?.showGrid !== undefined) {
        setParts.push(`side_view_show_grid = $${valueIndex++}`);
        values.push(viewSettings.showGrid);
      }
      if (viewSettings?.showLabels !== undefined) {
        setParts.push(`side_view_show_labels = $${valueIndex++}`);
        values.push(viewSettings.showLabels);
      }
      if (viewSettings?.showHeightGuides !== undefined) {
        setParts.push(`side_view_show_height_guides = $${valueIndex++}`);
        values.push(viewSettings.showHeightGuides);
      }
      if (viewSettings?.showGroundLine !== undefined) {
        setParts.push(`side_view_show_ground_line = $${valueIndex++}`);
        values.push(viewSettings.showGroundLine);
      }
      if (selectedSensor !== undefined) {
        setParts.push(`side_view_selected_sensor = $${valueIndex++}`);
        values.push(selectedSensor);
      }
      
      if (setParts.length > 0) {
        setParts.push('updated_at = NOW()');
        
        result = await Database.query(
          `UPDATE user_device_filters SET ${setParts.join(', ')}
           WHERE user_id = $1 AND device_id = $2
           RETURNING id, created_at, updated_at`,
          values
        );
      }
    }
    
    const filterResult = result[0];
    console.log(`✅ 측면도 필터 ${isNewFilter ? '생성' : '업데이트'} 완료: ${deviceId}`);
    
    // 캐시 무효화
    await invalidateUserCache(userId, 'filter*');
    if (cache.del) {
      await cache.del(`filter:side-view:${deviceId}:${userId}`);
    }
    
    res.json({
      success: true,
      isNewFilter: isNewFilter,
      message: `측면도 설정이 성공적으로 ${isNewFilter ? '생성' : '업데이트'}되었습니다.`,
      savedAt: filterResult.updated_at
    });
    
  } catch (error) {
    console.error('Save side view filter error:', error);
    res.status(500).json({
      success: false,
      error: '측면도 필터 저장 중 오류가 발생했습니다.'
    });
  }
});

// 🔥 센서 위치 조회 API
router.get('/:deviceId/sensor-positions/:viewType', authenticateToken, cacheMiddleware(300, (req) => `filter:sensor-positions:${req.params.deviceId}:${req.params.viewType}:${req.user.id}`), async (req, res) => {
  try {
    const { deviceId, viewType } = req.params;
    const userId = req.user.id;
    
    if (!['floor_plan', 'side_view'].includes(viewType)) {
      return res.status(400).json({
        success: false,
        error: 'viewType은 floor_plan 또는 side_view여야 합니다.'
      });
    }
    
    console.log(`📍 센서 위치 조회: ${deviceId} ${viewType} by user ${req.user.email}`);
    
    // 사용자가 소유한 장치인지 확인
    const deviceCheck = await Database.query(
      'SELECT device_id FROM devices WHERE device_id = $1 AND registered_by = $2',
      [deviceId, userId]
    );
    
    if (deviceCheck.length === 0) {
      return res.status(404).json({
        success: false,
        error: '해당 장치에 대한 권한이 없거나 장치를 찾을 수 없습니다.'
      });
    }
    
    // 센서 위치 데이터 조회
    const positionsData = await Database.query(
      `SELECT sensor_id, device_name, sensor_type, x_position, y_position, z_position, rotation, updated_at
       FROM user_sensor_positions 
       WHERE user_id = $1 AND device_id = $2 AND view_type = $3
       ORDER BY sensor_id`,
      [userId, deviceId, viewType]
    );
    
    console.log(`📍 센서 위치 ${positionsData.length}개 조회: ${deviceId} ${viewType}`);
    
    const positions = positionsData.map(pos => ({
      sensor_id: pos.sensor_id,
      device_name: pos.device_name,
      sensor_type: pos.sensor_type,
      x: parseFloat(pos.x_position) || 0,
      y: parseFloat(pos.y_position) || 0,
      z: parseFloat(pos.z_position) || 0,
      rotation: parseFloat(pos.rotation) || 0
    }));
    
    res.json({
      success: true,
      positions: positions,
      count: positions.length,
      deviceId: deviceId,
      viewType: viewType,
      message: `${viewType} 센서 위치를 불러왔습니다.`
    });
    
  } catch (error) {
    console.error('Get sensor positions error:', error);
    res.status(500).json({
      success: false,
      error: '센서 위치 조회 중 오류가 발생했습니다.',
      positions: []
    });
  }
});

// 🔥 센서 위치 저장/업데이트 API
router.post('/:deviceId/sensor-positions/:viewType', authenticateToken, async (req, res) => {
  try {
    const { deviceId, viewType } = req.params;
    const { positions } = req.body;
    const userId = req.user.id;
    
    if (!['floor_plan', 'side_view'].includes(viewType)) {
      return res.status(400).json({
        success: false,
        error: 'viewType은 floor_plan 또는 side_view여야 합니다.'
      });
    }
    
    if (!Array.isArray(positions)) {
      return res.status(400).json({
        success: false,
        error: 'positions는 배열이어야 합니다.'
      });
    }
    
    console.log(`💾 센서 위치 저장: ${deviceId} ${viewType} by user ${req.user.email}, ${positions.length}개`);
    
    // 사용자가 소유한 장치인지 확인
    const deviceCheck = await Database.query(
      'SELECT device_id FROM devices WHERE device_id = $1 AND registered_by = $2',
      [deviceId, userId]
    );
    
    if (deviceCheck.length === 0) {
      return res.status(404).json({
        success: false,
        error: '해당 장치에 대한 권한이 없거나 장치를 찾을 수 없습니다.'
      });
    }
    // 🔥 센서 타입 문자열→숫자 매핑
    const sensorTypeMapping = {
      '온습도센서': 1,
      'SHT20': 1,
      '조도센서': 2,
      'BH1750': 2,
      'ADS1115': 3,
      'CO2센서': 4,
      'SCD30': 4,
      'DS18B20': 5,
      '온도센서': 5,
      'MODBUS_TH': 11,
      'MODBUS_PRESSURE': 12,
      'MODBUS_FLOW': 13,
      'MODBUS_RELAY': 14,
      'MODBUS_ENERGY': 15,
      '풍향센서': 16,
      '풍속센서': 17,
      '강우센서': 18,
      '토양센서': 19
    };

    // 🔥 센서 타입 변환 함수
    const getSensorTypeNumber = (sensorType) => {
      // 이미 숫자면 그대로 반환
      if (typeof sensorType === 'number') {
        return sensorType;
      }
      
      // 문자열 숫자면 parseInt
      if (typeof sensorType === 'string' && !isNaN(parseInt(sensorType))) {
        return parseInt(sensorType);
      }
      
      // 문자열 이름이면 매핑에서 찾기
      if (typeof sensorType === 'string') {
        return sensorTypeMapping[sensorType] || 0;
      }
      
      return 0; // 기본값
    };
    // 트랜잭션 시작
    await Database.query('BEGIN');
    
    try {
      // 기존 위치 데이터 삭제
      await Database.query(
        'DELETE FROM user_sensor_positions WHERE user_id = $1 AND device_id = $2 AND view_type = $3',
        [userId, deviceId, viewType]
      );
      
      // 새 위치 데이터 삽입
      for (const position of positions) {
        const sensorTypeNumber = getSensorTypeNumber(position.sensor_type);
        await Database.query(
            `INSERT INTO user_sensor_positions (
            user_id, device_id, sensor_id, device_name, sensor_type, view_type,
            x_position, y_position, z_position, rotation, created_at, updated_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW(), NOW())
            ON CONFLICT (user_id, device_id, sensor_id, view_type) 
            DO UPDATE SET
            device_name = EXCLUDED.device_name,
            sensor_type = EXCLUDED.sensor_type,
            x_position = EXCLUDED.x_position,
            y_position = EXCLUDED.y_position,
            z_position = EXCLUDED.z_position,
            rotation = EXCLUDED.rotation,
            updated_at = NOW()`,
            [
            userId, deviceId,
            position.sensor_id,
            position.device_name,
            sensorTypeNumber,
            viewType,
            position.x || 0,
            position.y || 0,
            position.z || 0,
            position.rotation || 0
            ]
        );
    }

      
      await Database.query('COMMIT');
      
      console.log(`✅ 센서 위치 저장 완료: ${deviceId} ${viewType}, ${positions.length}개`);
      
      // 캐시 무효화
      await invalidateUserCache(userId, 'filter*');
      if (cache.del) {
        await cache.del(`filter:sensor-positions:${deviceId}:${viewType}:${userId}`);
      }
      
      res.json({
        success: true,
        message: `${viewType} 센서 위치가 성공적으로 저장되었습니다.`,
        count: positions.length,
        deviceId: deviceId,
        viewType: viewType
      });
      
    } catch (error) {
      await Database.query('ROLLBACK');
      throw error;
    }
    
  } catch (error) {
    console.error('Save sensor positions error:', error);
    res.status(500).json({
      success: false,
      error: '센서 위치 저장 중 오류가 발생했습니다.'
    });
  }
});

// 🔥 전역 설정 조회 API
router.get('/global', authenticateToken, cacheMiddleware(300, (req) => `filter:global:${req.user.id}`), async (req, res) => {
  try {
    const userId = req.user.id;
    
    console.log(`🌐 전역 설정 조회: ${req.user.email}`);
    
    const globalData = await Database.query(
      `SELECT * FROM user_global_filters WHERE user_id = $1`,
      [userId]
    );
    
    if (globalData.length === 0) {
      return res.json({
        success: true,
        hasSettings: false,
        settings: {
          favoriteGroupIds: {},
          lastSelectedDevice: null,
          homeSettings: {
            isGreenhouseExpanded: true,
            selectedWeatherRegion: '서울',
            dashboardLayout: 'default',
            favoritesPanelExpanded: true
          }
        },
        message: '기본 설정을 사용합니다.'
      });
    }
    
    const data = globalData[0];
    
    res.json({
      success: true,
      hasSettings: true,
      settings: {
        favoriteGroupIds: data.favorite_group_ids || {},
        lastSelectedDevice: data.last_selected_device_id ? {
          deviceId: data.last_selected_device_id,
          context: data.last_selected_context,
          timestamp: data.last_selected_timestamp
        } : null,
        homeSettings: {
          isGreenhouseExpanded: data.home_greenhouse_expanded,
          selectedWeatherRegion: data.home_selected_weather_region,
          dashboardLayout: data.home_dashboard_layout,
          favoritesPanelExpanded: data.home_favorites_panel_expanded
        }
      },
      lastUpdated: data.updated_at,
      message: '전역 설정을 불러왔습니다.'
    });
    
  } catch (error) {
    console.error('Get global settings error:', error);
    res.status(500).json({
      success: false,
      error: '전역 설정 조회 중 오류가 발생했습니다.'
    });
  }
});

// 🔥 전역 설정 특정 필드 업데이트 API
router.patch('/global/:fieldName', authenticateToken, async (req, res) => {
  try {
    const { fieldName } = req.params;
    const { value } = req.body;
    const userId = req.user.id;
    
    // 필드 매핑
    const fieldMapping = {
      'favoriteGroupIds': 'favorite_group_ids',
      'lastSelectedDeviceId': 'last_selected_device_id',
      'lastSelectedContext': 'last_selected_context',
      'isGreenhouseExpanded': 'home_greenhouse_expanded',
      'selectedWeatherRegion': 'home_selected_weather_region',
      'dashboardLayout': 'home_dashboard_layout',
      'favoritesPanelExpanded': 'home_favorites_panel_expanded'
    };
    
    const dbFieldName = fieldMapping[fieldName];
    if (!dbFieldName) {
      return res.status(400).json({
        success: false,
        error: `허용되지 않은 필드: ${fieldName}`
      });
    }
    
    console.log(`🔧 전역 설정 ${fieldName} 필드 업데이트:`, value);
    
    // 🔥 행이 존재하는지 확인
    const existingGlobal = await Database.query(
      'SELECT id FROM user_global_filters WHERE user_id = $1',
      [userId]
    );
    
    let result;
    
    if (existingGlobal.length === 0) {
      // 🔥 새 행 생성
      let insertQuery = `INSERT INTO user_global_filters (user_id, ${dbFieldName}`;
      let valueQuery = `VALUES ($1, $2`;
      const insertValues = [userId, value];
      
      if (fieldName === 'lastSelectedDeviceId') {
        insertQuery += ', last_selected_timestamp';
        valueQuery += ', NOW()';
      }
      
      insertQuery += ', created_at, updated_at) ';
      valueQuery += ', NOW(), NOW()) RETURNING id, updated_at';
      
      result = await Database.query(insertQuery + valueQuery, insertValues);
    } else {
      // 🔥 기존 행 업데이트
      let updateQuery = `UPDATE user_global_filters SET ${dbFieldName} = $1`;
      const updateValues = [value, userId];
      
      if (fieldName === 'lastSelectedDeviceId') {
        updateQuery += ', last_selected_timestamp = NOW()';
      }
      
      updateQuery += ', updated_at = NOW() WHERE user_id = $2 RETURNING id, updated_at';
      
      result = await Database.query(updateQuery, updateValues);
    }
    
    console.log(`✅ 전역 설정 ${fieldName} 업데이트 완료`);
    
    // 캐시 무효화
    await invalidateUserCache(userId, 'filter*');
    if (cache.del) {
      await cache.del(`filter:global:${userId}`);
    }
    
    res.json({
      success: true,
      message: `${fieldName} 설정이 업데이트되었습니다.`,
      updatedField: fieldName,
      value: value,
      savedAt: result[0].updated_at
    });
    
  } catch (error) {
    console.error('Update global settings field error:', error);
    res.status(500).json({
      success: false,
      error: '전역 설정 필드 업데이트 중 오류가 발생했습니다.'
    });
  }
});

// 🔥 사용자의 모든 필터 조회 API (디버깅용)
router.get('/list', authenticateToken, cacheMiddleware(180, (req) => `filters:list:${req.user.id}`), async (req, res) => {
  try {
    const userId = req.user.id;
    
    console.log(`📋 사용자 필터 목록 조회: ${req.user.email}`);
    
    // 장치별 필터 조회
    const deviceFiltersQuery = `
      SELECT 
        udf.device_id,
        d.device_name,
        udf.selected_sensor_types,
        udf.selected_bar_values,
        udf.mobile_chart_tab,
        udf.greenhouse_width,
        udf.greenhouse_height,
        udf.greenhouse_length,
        udf.greenhouse_type,
        udf.floor_plan_selected_sensor,
        udf.side_view_selected_sensor,
        udf.created_at,
        udf.updated_at
      FROM user_device_filters udf
      JOIN devices d ON udf.device_id = d.device_id AND d.registered_by = $1
      WHERE udf.user_id = $1
      ORDER BY udf.updated_at DESC
    `;
    
    const deviceFilters = await Database.query(deviceFiltersQuery, [userId]);
    
    // 전역 설정 조회
    const globalFiltersQuery = `
      SELECT * FROM user_global_filters WHERE user_id = $1
    `;
    
    const globalFilters = await Database.query(globalFiltersQuery, [userId]);
    
    // 센서 위치 통계
    const positionStatsQuery = `
      SELECT 
        device_id,
        view_type,
        COUNT(*) as sensor_count
      FROM user_sensor_positions 
      WHERE user_id = $1
      GROUP BY device_id, view_type
      ORDER BY device_id, view_type
    `;
    
    const positionStats = await Database.query(positionStatsQuery, [userId]);
    
    console.log(`📋 장치 필터 ${deviceFilters.length}개, 전역 설정 ${globalFilters.length}개, 센서 위치 통계 ${positionStats.length}개`);
    
    res.json({
      success: true,
      deviceFilters: deviceFilters,
      globalFilters: globalFilters.length > 0 ? globalFilters[0] : null,
      positionStats: positionStats,
      summary: {
        deviceFilterCount: deviceFilters.length,
        hasGlobalSettings: globalFilters.length > 0,
        positionStatsCount: positionStats.length
      }
    });
    
  } catch (error) {
    console.error('Get filters list error:', error);
    res.status(500).json({
      success: false,
      error: '필터 목록 조회 중 오류가 발생했습니다.',
      deviceFilters: [],
      globalFilters: null,
      positionStats: []
    });
  }
});

// 🔥 특정 장치의 모든 필터 조회 API
router.get('/:deviceId/all', authenticateToken, cacheMiddleware(180, (req) => `filters:device:${req.params.deviceId}:${req.user.id}`), async (req, res) => {
  try {
    const { deviceId } = req.params;
    const userId = req.user.id;
    
    console.log(`📋 장치 필터 조회: ${deviceId} by user ${req.user.email}`);
    
    // 사용자가 소유한 장치인지 확인
    const deviceCheck = await Database.query(
      'SELECT device_id, device_name FROM devices WHERE device_id = $1 AND registered_by = $2',
      [deviceId, userId]
    );
    
    if (deviceCheck.length === 0) {
      return res.status(404).json({
        success: false,
        error: '해당 장치에 대한 권한이 없거나 장치를 찾을 수 없습니다.'
      });
    }
    
    const device = deviceCheck[0];
    
    // 장치 필터 조회
    const deviceFilter = await Database.query(
      `SELECT * FROM user_device_filters WHERE user_id = $1 AND device_id = $2`,
      [userId, deviceId]
    );
    
    // 센서 위치 조회
    const sensorPositions = await Database.query(
      `SELECT view_type, sensor_id, device_name, sensor_type, x_position, y_position, z_position, rotation, updated_at
       FROM user_sensor_positions 
       WHERE user_id = $1 AND device_id = $2
       ORDER BY view_type, sensor_id`,
      [userId, deviceId]
    );
    
    console.log(`📋 ${device.device_name} - 필터: ${deviceFilter.length > 0 ? '있음' : '없음'}, 센서 위치: ${sensorPositions.length}개`);
    
    res.json({
      success: true,
      deviceId: deviceId,
      deviceName: device.device_name,
      deviceFilter: deviceFilter.length > 0 ? deviceFilter[0] : null,
      sensorPositions: sensorPositions,
      summary: {
        hasDeviceFilter: deviceFilter.length > 0,
        sensorPositionCount: sensorPositions.length,
        floorPlanPositions: sensorPositions.filter(p => p.view_type === 'floor_plan').length,
        sideViewPositions: sensorPositions.filter(p => p.view_type === 'side_view').length
      }
    });
    
  } catch (error) {
    console.error('Get device filters error:', error);
    res.status(500).json({
      success: false,
      error: '장치 필터 조회 중 오류가 발생했습니다.'
    });
  }
});

// 🔥 필터 통계 API
router.get('/stats', authenticateToken, cacheMiddleware(600, (req) => `filters:stats:${req.user.id}`), async (req, res) => {
  try {
    const userId = req.user.id;
    
    console.log(`📊 필터 통계 조회: ${req.user.email}`);
    
    // 장치별 필터 통계
    const deviceStatsQuery = `
      SELECT 
        COUNT(*) as total_device_filters,
        COUNT(CASE WHEN selected_sensor_types IS NOT NULL THEN 1 END) as sensor_chart_filters,
        COUNT(CASE WHEN greenhouse_width IS NOT NULL THEN 1 END) as floor_plan_filters,
        COUNT(CASE WHEN side_view_show_grid IS NOT NULL THEN 1 END) as side_view_filters,
        MAX(updated_at) as last_updated
      FROM user_device_filters 
      WHERE user_id = $1
    `;
    
    const deviceStats = await Database.query(deviceStatsQuery, [userId]);
    
    // 센서 위치 통계
    const positionStatsQuery = `
      SELECT 
        view_type,
        COUNT(*) as count,
        COUNT(DISTINCT device_id) as device_count
      FROM user_sensor_positions 
      WHERE user_id = $1
      GROUP BY view_type
    `;
    
    const positionStats = await Database.query(positionStatsQuery, [userId]);
    
    // 전역 설정 확인
    const globalStatsQuery = `
      SELECT 
        CASE WHEN favorite_group_ids IS NOT NULL THEN 1 ELSE 0 END as has_favorite_groups,
        CASE WHEN last_selected_device_id IS NOT NULL THEN 1 ELSE 0 END as has_last_device,
        CASE WHEN home_greenhouse_expanded IS NOT NULL THEN 1 ELSE 0 END as has_home_settings,
        updated_at
      FROM user_global_filters 
      WHERE user_id = $1
    `;
    
    const globalStats = await Database.query(globalStatsQuery, [userId]);
    
    const stats = {
      deviceFilters: deviceStats[0] || {
        total_device_filters: 0,
        sensor_chart_filters: 0,
        floor_plan_filters: 0,
        side_view_filters: 0,
        last_updated: null
      },
      sensorPositions: positionStats,
      globalSettings: globalStats.length > 0 ? globalStats[0] : {
        has_favorite_groups: 0,
        has_last_device: 0,
        has_home_settings: 0,
        updated_at: null
      }
    };
    
    console.log(`📊 필터 통계:`, stats);
    
    res.json({
      success: true,
      stats: stats
    });
    
  } catch (error) {
    console.error('Get filters stats error:', error);
    res.status(500).json({
      success: false,
      error: '필터 통계 조회 중 오류가 발생했습니다.',
      stats: {}
    });
  }
});

// 🔥 캐시 무효화 API
router.post('/invalidate-cache', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { deviceId, filterTypes = ['sensor_chart', 'floor_plan', 'side_view'] } = req.body;
    
    console.log(`🧹 필터 캐시 무효화 요청: ${req.user.email}`);
    
    const cachePromises = [
      invalidateUserCache(userId, 'filter*')
    ];
    
    if (deviceId) {
      filterTypes.forEach(filterType => {
        if (cache.del) {
          cachePromises.push(cache.del(`filter:${filterType}:${deviceId}:${userId}`));
        }
      });
    }
    
    if (cache.del) {
      cachePromises.push(
        cache.del(`filter:global:${userId}`),
        cache.del(`filters:list:${userId}`),
        cache.del(`filters:stats:${userId}`)
      );
    }
    
    await Promise.all(cachePromises.filter(Boolean));
    
    console.log(`✅ 필터 캐시 무효화 완료`);
    
    res.json({
      success: true,
      message: '필터 캐시가 성공적으로 무효화되었습니다.',
      invalidatedTypes: filterTypes,
      deviceId: deviceId || 'all'
    });
    
  } catch (error) {
    console.error('Filter cache invalidation error:', error);
    res.status(500).json({
      success: false,
      error: '필터 캐시 무효화 중 오류가 발생했습니다.'
    });
  }
});

module.exports = router;