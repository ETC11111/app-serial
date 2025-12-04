import React, { useState, useMemo, useEffect, useRef } from 'react';
import { DetectedSensor } from '../../types/sensor.types';
import { SensorCard } from './SensorCard';

interface SensorCardsGridProps {
  sensors: DetectedSensor[];
  animatingCards: Set<string>;
  isMobile?: boolean;
  // 편집 상태를 외부에서 제어하기 위한 props 추가
  isDragMode?: boolean;
  onToggleDragMode?: () => void;
  onResetOrder?: () => void;
  customOrder?: string[];
  deviceId?: string; // DB 저장을 위한 deviceId
}

interface SensorCardData {
  sensor: DetectedSensor;
  valueIndex: number;
  value: number | string;
  key: string;
  originalIndex: number;
}

export const SensorCardsGrid: React.FC<SensorCardsGridProps> = ({
  sensors,
  animatingCards,
  isMobile = false,
  isDragMode: externalIsDragMode,
  onToggleDragMode,
  onResetOrder: externalResetOrder,
  customOrder: externalCustomOrder,
  deviceId
}) => {
  const [currentPage, setCurrentPage] = useState(0);
  const [customOrder, setCustomOrder] = useState<string[]>(externalCustomOrder || []);
  const [isDragMode, setIsDragMode] = useState(externalIsDragMode || false);
  const [draggedItem, setDraggedItem] = useState<string | null>(null);
  const [dragOverItem, setDragOverItem] = useState<string | null>(null);
  const [touchDrag, setTouchDrag] = useState({
    isDragging: false,
    draggedKey: '',
    startX: 0,
    startY: 0
  });

  const gridRef = useRef<HTMLDivElement>(null);
  const STORAGE_KEY = 'sensorCards_customOrder';
  const WEATHER_SENSOR_TYPES = [16, 17, 18];

  const filteredSensors = useMemo(() => {
    return sensors.filter(sensor => !WEATHER_SENSOR_TYPES.includes(sensor.type));
  }, [sensors]);

  const saveOrder = (order: string[]) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(order));
    } catch (error) {
      console.error('저장 실패:', error);
    }
  };

  const loadOrder = (): string[] => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      return saved ? JSON.parse(saved) : [];
    } catch (error) {
      console.error('로드 실패:', error);
      return [];
    }
  };

  // 🔥 특정 센서 값 필터링 함수 추가
  const shouldShowSensorValue = (sensor: DetectedSensor, valueIndex: number): boolean => {
    // 토양센서(타입 19)에서 pH, EC, 온도, 습도만 표시 (index 0,1,2,3)
    if (sensor.type === 19) {
      return valueIndex >= 0 && valueIndex <= 3;
    }
    
    return true;
  };

  const sensorCards = useMemo(() => {
    const cards: SensorCardData[] = [];
    let index = 0;
    
    filteredSensors.forEach((sensor) => {
      sensor.values?.forEach((value: number | string, valueIndex: number) => {
        // 🔥 센서 값 필터링 적용
        if (!shouldShowSensorValue(sensor, valueIndex)) {
          return; // NPK 값들은 건너뛰기
        }
        
        if (value !== null && value !== undefined && value !== '') {
          const isValid = typeof value === 'string' || (typeof value === 'number' && !isNaN(value));
          
          if (isValid) {
            cards.push({
              sensor,
              valueIndex,
              value,
              key: `${sensor.sensor_id || sensor.name}-${valueIndex}`,
              originalIndex: index++
            });
          }
        }
      });
    });
    
    return cards;
  }, [filteredSensors]);

  const orderedCards = useMemo(() => {
    if (customOrder.length === 0) return sensorCards;

    const orderMap = new Map(customOrder.map((key, i) => [key, i]));
    
    return [...sensorCards].sort((a, b) => {
      const orderA = orderMap.get(a.key) ?? 999999;
      const orderB = orderMap.get(b.key) ?? 999999;
      
      if (orderA === 999999 && orderB === 999999) {
        return a.originalIndex - b.originalIndex;
      }
      
      return orderA - orderB;
    });
  }, [sensorCards, customOrder]);

  // 외부 상태와 동기화
  useEffect(() => {
    if (externalIsDragMode !== undefined) {
      setIsDragMode(externalIsDragMode);
    }
  }, [externalIsDragMode]);

  useEffect(() => {
    if (externalCustomOrder !== undefined) {
      setCustomOrder(externalCustomOrder);
    }
  }, [externalCustomOrder]);

  useEffect(() => {
    const saved = loadOrder();
    if (saved.length > 0) {
      setCustomOrder(saved);
    }
  }, []);

  useEffect(() => {
    if (customOrder.length > 0) {
      const currentKeys = sensorCards.map(card => card.key);
      const validOrder = customOrder.filter(key => currentKeys.includes(key));
      
      if (validOrder.length !== customOrder.length) {
        setCustomOrder(validOrder);
        saveOrder(validOrder);
      }
    }
  }, [sensorCards, customOrder]);

  if (sensorCards.length === 0) return null;

  const cardsPerPage = isMobile ? 6 : 8;
  const totalPages = Math.ceil(orderedCards.length / cardsPerPage);
  
  const getCurrentCards = () => {
    const start = currentPage * cardsPerPage;
    const end = start + cardsPerPage;
    return orderedCards.slice(start, end);
  };

  const findClosestCard = (x: number, y: number): string | null => {
    if (!gridRef.current) return null;
    
    const cards = gridRef.current.querySelectorAll('[data-card-key]');
    let closestKey: string | null = null;
    let closestDistance = Infinity;
    
    cards.forEach((card) => {
      const rect = card.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      const distance = Math.sqrt((x - centerX) ** 2 + (y - centerY) ** 2);
      
      if (distance < closestDistance) {
        closestKey = card.getAttribute('data-card-key') || '';
        closestDistance = distance;
      }
    });
    
    return closestKey;
  };

  const changeOrder = (draggedKey: string, targetKey: string) => {
    const newOrder = [...orderedCards.map(card => card.key)];
    const draggedIndex = newOrder.indexOf(draggedKey);
    const targetIndex = newOrder.indexOf(targetKey);

    if (draggedIndex !== -1 && targetIndex !== -1) {
      newOrder.splice(draggedIndex, 1);
      newOrder.splice(targetIndex, 0, draggedKey);
      
      setCustomOrder(newOrder);
      saveOrder(newOrder);
      
      if (navigator.vibrate && isMobile) {
        navigator.vibrate(100);
      }
    }
  };

  const onDragStart = (e: React.DragEvent, cardKey: string) => {
    setDraggedItem(cardKey);
    e.dataTransfer.effectAllowed = 'move';
  };

  const onDragOver = (e: React.DragEvent, cardKey: string) => {
    e.preventDefault();
    setDragOverItem(cardKey);
  };

  const onDragLeave = () => {
    setDragOverItem(null);
  };

  const onDrop = (e: React.DragEvent, targetKey: string) => {
    e.preventDefault();
    
    if (draggedItem && draggedItem !== targetKey) {
      changeOrder(draggedItem, targetKey);
    }
    
    setDraggedItem(null);
    setDragOverItem(null);
  };

  const onDragEnd = () => {
    setDraggedItem(null);
    setDragOverItem(null);
  };

  const onTouchStart = (e: React.TouchEvent, cardKey: string) => {
    if (!isDragMode) return;
    
    const touch = e.touches[0];
    setTouchDrag({
      isDragging: false,
      draggedKey: cardKey,
      startX: touch.clientX,
      startY: touch.clientY
    });
    
    if (navigator.vibrate) {
      navigator.vibrate(50);
    }
  };

  const onTouchMove = (e: React.TouchEvent) => {
    if (!isDragMode || !touchDrag.draggedKey) return;
    
    e.preventDefault();
    const touch = e.touches[0];
    const deltaX = Math.abs(touch.clientX - touchDrag.startX);
    const deltaY = Math.abs(touch.clientY - touchDrag.startY);
    
    if (!touchDrag.isDragging && (deltaX > 10 || deltaY > 10)) {
      setTouchDrag(prev => ({ ...prev, isDragging: true }));
      setDraggedItem(touchDrag.draggedKey);
    }
    
    if (touchDrag.isDragging) {
      const closestKey = findClosestCard(touch.clientX, touch.clientY);
      if (closestKey && closestKey !== touchDrag.draggedKey) {
        setDragOverItem(closestKey);
      }
    }
  };

  const onTouchEnd = () => {
    if (touchDrag.isDragging && dragOverItem && touchDrag.draggedKey) {
      changeOrder(touchDrag.draggedKey, dragOverItem);
    }
    
    setTouchDrag({ isDragging: false, draggedKey: '', startX: 0, startY: 0 });
    setDraggedItem(null);
    setDragOverItem(null);
  };

  const toggleDragMode = () => {
    if (onToggleDragMode) {
      onToggleDragMode();
    } else {
      setIsDragMode(!isDragMode);
    }
  };
  
  const resetOrder = () => {
    if (externalResetOrder) {
      externalResetOrder();
    } else {
      setCustomOrder([]);
      saveOrder([]);
    }
  };
  const prevPage = () => setCurrentPage(prev => Math.max(0, prev - 1));
  const nextPage = () => setCurrentPage(prev => Math.min(totalPages - 1, prev + 1));

  const currentCards = getCurrentCards();

  return (
    <div className="bg-white mx-auto rounded-md">
      {/* 헤더 */}
      <div className="mb-2">
        <div className={`flex items-center ${isMobile ? 'relative' : 'justify-between'}`}>
          <div>
            <h3 className={`font-semibold text-gray-700 flex items-center space-x-2 ${
              isMobile ? 'text-base' : 'text-lg'
            }`}>
              {customOrder.length > 0 && (
                <span className="text-xs bg-blue-100 text-blue-600 px-2 py-1 rounded-full">
                  커스텀
                </span>
              )}
            </h3>

          </div>
          
          {/* 데스크톱 컨트롤 버튼들만 표시 */}
          {!isMobile && (
            <div className="flex items-center space-x-2">
              <button
                onClick={toggleDragMode}
                className={`px-3 py-2 rounded-md text-xs font-medium transition-colors ${
                  isDragMode
                    ? 'bg-green-100 text-green-700 border border-green-300'
                    : 'bg-gray-100 text-gray-600 border border-gray-300 hover:bg-gray-200'
                }`}
              >
                {isDragMode ? (
                  <React.Fragment>
                    <img src="/setup.png" alt="완료" className="w-4 h-4 inline mr-1" />
                    편집중
                  </React.Fragment>
                ) : (
                  <React.Fragment>
                    <img src="/edit.png" alt="편집" className="w-4 h-4 inline mr-1" />
                    편집
                  </React.Fragment>
                )}
              </button>

              {customOrder.length > 0 && (
                <button
                  onClick={resetOrder}
                  className="px-3 py-2 rounded-md text-xs font-medium bg-orange-100 text-orange-700 border border-orange-300 hover:bg-orange-200 transition-colors"
                >
                  <img src="/refresh.png" alt="초기화" className="w-4 h-4 inline mr-1" />
                  초기화
                </button>
              )}

              {totalPages > 1 && (
                <div className="flex items-center space-x-2">
                  <span className="text-xs text-gray-500">
                    {currentPage + 1} / {totalPages}
                  </span>
                  <div className="flex flex-col space-y-1">
                    <button
                      onClick={prevPage}
                      disabled={currentPage === 0}
                      className={`w-8 h-6 flex items-center justify-center rounded text-xs transition-colors ${
                        currentPage === 0
                          ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                          : 'bg-blue-100 text-blue-600 hover:bg-blue-200'
                      }`}
                    >
                      ▲
                    </button>
                    <button
                      onClick={nextPage}
                      disabled={currentPage >= totalPages - 1}
                      className={`w-8 h-6 flex items-center justify-center rounded text-xs transition-colors ${
                        currentPage >= totalPages - 1
                          ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                          : 'bg-blue-100 text-blue-600 hover:bg-blue-200'
                      }`}
                    >
                      ▼
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* 모바일 초기화 버튼 */}
          {isMobile && customOrder.length > 0 && (
            <div className="absolute top-0 right-0">
              <button
                onClick={resetOrder}
                className="px-2 py-1 rounded-md text-xs font-medium bg-orange-100 text-orange-700 border border-orange-300 hover:bg-orange-200 transition-colors"
              >
                <img src="/refresh.png" alt="초기화" className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>

        {/* 모바일 페이지네이션 */}
        {totalPages > 1 && isMobile && (
          <div className="flex items-center justify-center space-x-3 mt-3">
            <button
              onClick={prevPage}
              disabled={currentPage === 0}
              className={`px-3 py-1 rounded text-sm transition-colors ${
                currentPage === 0
                  ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                  : 'bg-blue-100 text-blue-600 hover:bg-blue-200'
              }`}
            >
              ← 이전
            </button>
            <span className="text-sm text-gray-500">
              {currentPage + 1} / {totalPages}
            </span>
            <button
              onClick={nextPage}
              disabled={currentPage >= totalPages - 1}
              className={`px-3 py-1 rounded text-sm transition-colors ${
                currentPage >= totalPages - 1
                  ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                  : 'bg-blue-100 text-blue-600 hover:bg-blue-200'
              }`}
            >
              다음 →
            </button>
          </div>
        )}
      </div>

      {/* 편집 모드 안내 */}
      {isDragMode && (
        <div className={`mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg ${
          isMobile ? 'text-center' : ''
        }`}>
          <div className={`flex items-center space-x-2 text-blue-700 ${
            isMobile ? 'text-xs justify-center' : 'text-sm'
          }`}>
            <img src="/info.png" alt="정보" className="w-4 h-4" />
            <span>
              <strong>편집 모드:</strong> 
              {isMobile 
                ? ' 센서 카드를 길게 눌러 드래그하세요' 
                : ' 센서 카드를 드래그하여 원하는 위치에 놓으세요'
              }
            </span>
          </div>
        </div>
      )}
      
      {/* 센서 카드 그리드 */}
      <div 
        ref={gridRef}
        className={`gap-3 ${isMobile ? 'grid grid-cols-2' : 'grid grid-cols-4'}`}
      >
        {currentCards.map(({ sensor, valueIndex, value, key }) => {
          const isAnimating = animatingCards.has(sensor.sensor_id?.toString() || sensor.name);
          const isDragging = draggedItem === key;
          const isDragOver = dragOverItem === key;
          
          return (
            <div
              key={key}
              data-card-key={key}
              draggable={isDragMode && !isMobile}
              onDragStart={(e) => !isMobile && isDragMode && onDragStart(e, key)}
              onDragOver={(e) => !isMobile && isDragMode && onDragOver(e, key)}
              onDragLeave={!isMobile ? onDragLeave : undefined}
              onDrop={(e) => !isMobile && isDragMode && onDrop(e, key)}
              onDragEnd={!isMobile ? onDragEnd : undefined}
              onTouchStart={(e) => isMobile && onTouchStart(e, key)}
              onTouchMove={isMobile ? onTouchMove : undefined}
              onTouchEnd={isMobile ? onTouchEnd : undefined}
              className={`relative transition-all duration-200 ${
                isDragMode ? (isMobile ? 'active:scale-95' : 'cursor-move') : 'cursor-default'
              } ${
                isDragging ? 'opacity-60 scale-95 z-10' : 'opacity-100 scale-100'
              } ${
                isDragOver && !isDragging 
                  ? 'ring-2 ring-blue-400 shadow-lg scale-105' 
                  : ''
              }`}
              style={{
                touchAction: isDragMode && isMobile ? 'none' : 'auto'
              }}
            >
              <SensorCard
                sensor={sensor}
                valueIndex={valueIndex}
                value={value}
                isAnimating={isAnimating}
                allSensors={filteredSensors}
                deviceId={deviceId}
              />
              
              {isDragMode && (
                <div className={`absolute bg-gray-600 bg-opacity-80 rounded-full p-1 ${
                  isMobile ? 'top-1 right-1' : 'top-2 right-2'
                }`}>
                  <div className="text-white text-xs">⋮⋮</div>
                </div>
              )}
            </div>
          );
        })}
      </div>
      
      {/* 페이지 인디케이터 */}
      {totalPages > 1 && (
        <div className="flex justify-center mt-4 space-x-1">
          {Array.from({ length: totalPages }).map((_, index) => (
            <button
              key={index}
              onClick={() => setCurrentPage(index)}
              className={`${isMobile ? 'w-3 h-3' : 'w-2 h-2'} rounded-full transition-colors ${
                index === currentPage ? 'bg-blue-500' : 'bg-gray-300 hover:bg-gray-400'
              }`}
            />
          ))}
        </div>
      )}
      
      {/* 하단 정보 */}
      <div className={`flex justify-center items-center mt-4 ${
        isMobile ? 'flex-col space-y-1' : 'space-x-4'
      }`}>

        {customOrder.length > 0 && (
          <span className={`text-blue-600 bg-blue-50 px-2 py-1 rounded ${
            isMobile ? 'text-xs' : 'text-xs'
          }`}>
            사용자 정의 순서 적용중
          </span>
        )}
      </div>

      {/* 모바일 드래그 오버레이 */}
      {isMobile && touchDrag.isDragging && (
        <div className="fixed inset-0 bg-blue-50 bg-opacity-50 z-50 pointer-events-none">
          <div className="flex items-center justify-center h-full">
            <div className="bg-white p-4 rounded-lg shadow-lg">
              <div className="text-sm text-blue-600 font-medium">
                드래그 중... 원하는 위치에 놓으세요
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};