// components/MyPage.tsx - Layout 표준 스타일에 맞춘 수정
import React, { useState, useEffect } from 'react';
import Layout from '../components/Layout';
import TabButton from '../components/mypage/TabButton';
import ProfileTab from '../components/mypage/ProfileTab';
import WithdrawTab from '../components/mypage/WithdrawTab';

type TabType = 'profile' | 'withdraw';

const MyPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<TabType>('profile');
  const [isMobile, setIsMobile] = useState(false);

  // 모바일 환경 감지
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };

    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  const renderTabContent = () => {
    switch (activeTab) {
      case 'profile':
        return <ProfileTab />;
      case 'withdraw':
        return <WithdrawTab />;
      default:
        return <ProfileTab />;
    }
  };

  return (
    <Layout
      maxWidth="wide"                         // 마이페이지는 중간 크기가 적절
      padding={isMobile ? "sm" : "md"}          // 반응형 패딩
      background="gray"                         // 표준 배경
    >
      <div className="space-y-4">
        {/* 헤더 섹션 */}
        <div className="bg-white rounded-lg shadow p-4 lg:p-6">
          <div className="mb-6">
            <h1 className="text-2xl font-bold text-gray-800 mb-2">마이페이지</h1>
            <p className="text-gray-600">계정 정보를 관리하세요</p>
          </div>

          {/* 탭 네비게이션 */}
          <div className="flex space-x-1 bg-gray-100 p-1 rounded-lg">
            <TabButton
              isActive={activeTab === 'profile'}
              onClick={() => setActiveTab('profile')}
            >
              <img src="/human.png" alt="회원정보" className="inline-block w-5 h-5 mr-1" />
              회원정보
            </TabButton>
            <TabButton
              isActive={activeTab === 'withdraw'}
              onClick={() => setActiveTab('withdraw')}
            >
              <img src="/door.png" alt="회원정보" className="inline-block w-5 h-5 mr-1" />
              회원탈퇴
            </TabButton>
          </div>
        </div>

        {/* 탭 콘텐츠 */}
        <div className="bg-white rounded-lg shadow">
          {renderTabContent()}
        </div>
      </div>
    </Layout>
  );
};

export default MyPage;