// components/PrivacyPolicyModal.tsx - 깔끔한 개인정보 처리방침
import React from 'react';

interface PrivacyPolicyModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAccept?: () => void;
}

const PrivacyPolicyModal: React.FC<PrivacyPolicyModalProps> = ({ 
  isOpen, 
  onClose, 
  onAccept 
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      {/* 배경 오버레이 */}
      <div className="fixed inset-0 bg-black bg-opacity-50 transition-opacity" />
      
      {/* 모달 컨테이너 */}
      <div className="flex min-h-full items-center justify-center p-4">
        <div className="relative bg-white rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden">
          {/* 헤더 */}
          <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
            <h2 className="text-xl font-bold text-gray-900">개인정보 처리방침</h2>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 transition-colors p-2 hover:bg-gray-100 rounded-lg"
            >
              <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* 내용 */}
          <div className="px-6 py-4 overflow-y-auto max-h-[calc(90vh-140px)]">
            <div className="prose prose-sm max-w-none text-gray-700 space-y-6">
              <p className="text-base leading-relaxed">
                <strong>SerialLOG</strong>(이하 '회사'라 함)은 「개인정보 보호법」, 「정보통신망 이용촉진 및 정보보호 등에 관한 법률」 등 관련 법령을 준수하며, 이용자의 개인정보를 보호하고 권익을 보호하기 위해 다음과 같이 개인정보 처리방침을 수립·공개합니다.
              </p>

              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-3">제1조 수집하는 개인정보의 항목</h3>
                <p className="mb-3">회사는 서비스 제공을 위해 다음과 같은 개인정보를 수집합니다.</p>
                
                <div className="space-y-4">
                  <div className="bg-gray-50 p-4 rounded-lg">
                    <h4 className="font-medium text-gray-800 mb-2">1. 회원 가입 시 수집 항목</h4>
                    <ul className="list-disc list-inside space-y-1 text-sm ml-4">
                      <li><strong>필수항목:</strong> 이름, 이메일, 전화번호, 비밀번호</li>
                    </ul>
                  </div>
                  
                  <div className="bg-gray-50 p-4 rounded-lg">
                    <h4 className="font-medium text-gray-800 mb-2">2. 서비스 이용 중 자동 수집 항목</h4>
                    <ul className="list-disc list-inside space-y-1 text-sm ml-4">
                      <li>로그인 일시, 접속 IP주소, 접속 기록</li>
                      <li>브라우저 종류, 운영체제, 장치 식별 정보</li>
                      <li>쿠키, 서비스 이용 기록, 방문 기록</li>
                    </ul>
                  </div>
                  
                  <div className="bg-gray-50 p-4 rounded-lg">
                    <h4 className="font-medium text-gray-800 mb-2">3. 센서 장치 연동 시</h4>
                    <ul className="list-disc list-inside space-y-1 text-sm ml-4">
                      <li>설치 장치의 위치 정보(주소 또는 구역명)</li>
                      <li>장치 고유 ID, 센서 종류 및 설정 정보</li>
                    </ul>
                  </div>
                </div>
                
                <p className="text-sm text-gray-600 mt-3 bg-blue-50 p-3 rounded">
                  <strong>※ 위치정보 관련 안내:</strong> 장치 설치 시 위치정보는 사용자가 직접 입력하며, 실시간 위치추적 기능은 제공하지 않습니다.
                </p>
              </div>

              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-3">제2조 개인정보의 수집 및 이용 목적</h3>
                <p className="mb-3">회사는 수집한 개인정보를 다음의 목적을 위해서만 활용합니다:</p>
                <ul className="list-disc list-inside space-y-2 ml-4">
                  <li><strong>회원 관리:</strong> 회원 식별, 로그인 관리, 서비스 제공</li>
                  <li><strong>서비스 제공:</strong> 센서 장치 등록 및 제어, 실시간 데이터 제공</li>
                  <li><strong>영상 서비스:</strong> 실시간 영상 스트리밍 접속 제공 (저장하지 않음)</li>
                  <li><strong>고객 지원:</strong> 문의 응답, 서비스 운영 및 개선</li>
                  <li><strong>법적 의무:</strong> 관련 법령에 따른 의무 이행</li>
                </ul>
              </div>

              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-3">제3조 개인정보의 처리 및 보유 기간</h3>
                <p className="mb-3">개인정보는 수집 및 이용 목적이 달성된 후에는 지체 없이 파기됩니다. 단, 법령에 따라 보존이 필요한 경우에는 해당 기간 동안 보관됩니다.</p>
                
                <div className="overflow-x-auto mt-4">
                  <table className="min-w-full divide-y divide-gray-200 border border-gray-300 rounded-lg">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-3 text-left text-sm font-medium text-gray-900 border-r border-gray-200">구분</th>
                        <th className="px-4 py-3 text-left text-sm font-medium text-gray-900 border-r border-gray-200">보유기간</th>
                        <th className="px-4 py-3 text-left text-sm font-medium text-gray-900">근거</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      <tr>
                        <td className="px-4 py-3 text-sm text-gray-900 border-r border-gray-200">회원정보</td>
                        <td className="px-4 py-3 text-sm text-gray-900 border-r border-gray-200">회원 탈퇴 시까지</td>
                        <td className="px-4 py-3 text-sm text-gray-900">서비스 제공 목적</td>
                      </tr>
                      <tr className="bg-gray-50">
                        <td className="px-4 py-3 text-sm text-gray-900 border-r border-gray-200">접속 로그, 이용기록</td>
                        <td className="px-4 py-3 text-sm text-gray-900 border-r border-gray-200">3개월</td>
                        <td className="px-4 py-3 text-sm text-gray-900">통신비밀보호법</td>
                      </tr>
                      <tr>
                        <td className="px-4 py-3 text-sm text-gray-900 border-r border-gray-200">센서 데이터</td>
                        <td className="px-4 py-3 text-sm text-gray-900 border-r border-gray-200">1년</td>
                        <td className="px-4 py-3 text-sm text-gray-900">서비스 제공 및 분석</td>
                      </tr>
                      <tr className="bg-gray-50">
                        <td className="px-4 py-3 text-sm text-gray-900 border-r border-gray-200">실시간 영상</td>
                        <td className="px-4 py-3 text-sm text-gray-900 border-r border-gray-200">저장하지 않음</td>
                        <td className="px-4 py-3 text-sm text-gray-900">스트리밍만 제공</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-3">제4조 개인정보의 제3자 제공</h3>
                <p className="mb-3">회사는 원칙적으로 이용자의 개인정보를 외부에 제공하지 않습니다. 다만, 다음의 경우에는 예외적으로 제공될 수 있습니다:</p>
                <ul className="list-disc list-inside space-y-1 ml-4">
                  <li>이용자의 사전 동의를 받은 경우</li>
                  <li>법령의 규정에 의하거나, 수사기관의 수사목적으로 법령에 정해진 절차와 방법에 따라 요청이 있는 경우</li>
                  <li>통계작성, 학술연구 또는 시장조사를 위하여 필요한 경우로 특정 개인을 알아볼 수 없는 형태로 제공하는 경우</li>
                </ul>
              </div>

              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-3">제5조 개인정보 처리의 위탁</h3>
                <p className="mb-3">회사는 서비스 향상을 위해 개인정보 처리업무를 외부 전문업체에 위탁할 수 있으며, 위탁 시에는 다음 사항을 준수합니다:</p>
                <ul className="list-disc list-inside space-y-1 ml-4 mb-3">
                  <li>위탁계약서에 개인정보 보호 관련 지시사항, 비밀유지, 제3자 제공 금지 등을 명시</li>
                  <li>위탁업체의 개인정보 처리 현황을 정기적으로 점검</li>
                </ul>
                <div className="bg-gray-50 p-3 rounded text-sm">
                  <p><strong>현재 위탁 현황:</strong> 현재 기준으로 개인정보 처리를 위탁하고 있는 업체는 없습니다.</p>
                  <p className="mt-1 text-gray-600">※ 향후 위탁이 필요한 경우 본 처리방침을 통해 사전 공지하겠습니다.</p>
                </div>
              </div>

              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-3">제6조 실시간 영상 스트리밍 서비스 특별 안내</h3>
                <div className="bg-blue-50 border-l-4 border-blue-400 p-4 mb-3">
                  <p className="font-medium text-blue-800 mb-2">실시간 영상 스트리밍 서비스의 특성</p>
                  <ul className="list-disc list-inside space-y-1 text-sm text-blue-700 ml-4">
                    <li><strong>실시간 전송만 제공:</strong> 영상은 실시간으로만 스트리밍되며 녹화되거나 저장되지 않습니다</li>
                    <li><strong>접근 제한:</strong> 본인 인증을 거쳐 등록된 본인의 장치에만 접근 가능합니다</li>
                    <li><strong>보안 채널:</strong> 암호화된 보안 채널을 통해서만 영상이 전송됩니다</li>
                    <li><strong>접근 기록:</strong> 영상 접근 시간 및 접근자 정보는 보안 목적으로 기록됩니다</li>
                  </ul>
                </div>
              </div>

              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-3">제7조 개인정보를 자동으로 수집하는 장치의 설치·운영 및 그 거부에 관한 사항</h3>
                <div className="space-y-3">
                  <div>
                    <h4 className="font-medium text-gray-800 mb-2">1. 쿠키 등 자동수집장치의 설치·운영</h4>
                    <p className="text-sm mb-2">회사는 이용자에게 개별적인 맞춤서비스를 제공하기 위해 이용정보를 저장하고 수시로 불러오는 '쿠키(cookie)'를 사용합니다.</p>
                    <ul className="list-disc list-inside space-y-1 text-sm ml-4">
                      <li><strong>쿠키의 사용목적:</strong> 로그인 상태 유지, 서비스 이용 기록, 접속 빈도 분석</li>
                      <li><strong>쿠키의 설치·운영 및 거부:</strong> 브라우저 설정에서 쿠키 설정을 변경할 수 있습니다</li>
                    </ul>
                  </div>
                  
                  <div className="bg-yellow-50 p-3 rounded">
                    <p className="text-sm text-yellow-800">
                      <strong>※ 쿠키 거부 시 영향:</strong> 쿠키 설정을 거부할 경우 로그인이 필요한 일부 서비스 이용에 어려움이 있을 수 있습니다.
                    </p>
                  </div>
                </div>
              </div>

              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-3">제8조 정보주체와 법정대리인의 권리·의무 및 그 행사방법</h3>
                <div className="space-y-3">
                  <div>
                    <h4 className="font-medium text-gray-800 mb-2">1. 정보주체의 권리</h4>
                    <p className="text-sm mb-2">이용자는 언제든지 다음과 같은 권리를 행사할 수 있습니다:</p>
                    <ul className="list-disc list-inside space-y-1 text-sm ml-4">
                      <li>개인정보 열람 요구</li>
                      <li>오류 등이 있을 경우 정정·삭제 요구</li>
                      <li>처리정지 요구</li>
                      <li>동의철회 요구</li>
                    </ul>
                  </div>
                  
                  <div>
                    <h4 className="font-medium text-gray-800 mb-2">2. 권리 행사 방법</h4>
                    <div className="bg-gray-50 p-3 rounded text-sm">
                      <p className="mb-2"><strong>신청방법:</strong> 서면, 전화, 이메일을 통해 신청 가능</p>
                      <p className="mb-2"><strong>처리기한:</strong> 요구를 받은 날로부터 10일 이내</p>
                      <p><strong>본인확인:</strong> 권리 행사 시 본인 확인을 위해 신분증명서를 요구할 수 있습니다</p>
                    </div>
                  </div>
                  
                  <div>
                    <h4 className="font-medium text-gray-800 mb-2">3. 만 14세 미만 아동의 개인정보 처리</h4>
                    <p className="text-sm">만 14세 미만 아동의 개인정보를 수집할 때는 법정대리인의 동의를 받으며, 법정대리인은 아동의 개인정보에 대한 열람, 정정·삭제, 처리정지를 요구할 수 있습니다.</p>
                  </div>
                </div>
              </div>

              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-3">제9조 개인정보의 파기절차 및 파기방법</h3>
                <div className="space-y-3">
                  <div>
                    <h4 className="font-medium text-gray-800 mb-2">1. 파기절차</h4>
                    <p className="text-sm">개인정보는 목적 달성 후 지체 없이 파기됩니다. 법령에 의해 보존해야 하는 경우에는 별도 저장소로 옮겨 보관합니다.</p>
                  </div>
                  
                  <div>
                    <h4 className="font-medium text-gray-800 mb-2">2. 파기방법</h4>
                    <ul className="list-disc list-inside space-y-1 text-sm ml-4">
                      <li><strong>전자파일:</strong> 복구 불가능한 방법으로 완전 삭제</li>
                      <li><strong>종이문서:</strong> 분쇄하거나 소각하여 파기</li>
                    </ul>
                  </div>
                </div>
              </div>

              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-3">제10조 개인정보 보호를 위한 기술적·관리적 조치</h3>
                <div className="space-y-3">
                  <div>
                    <h4 className="font-medium text-gray-800 mb-2">1. 기술적 조치</h4>
                    <ul className="list-disc list-inside space-y-1 text-sm ml-4">
                      <li>개인정보 암호화 저장 및 전송</li>
                      <li>해킹 등 침입차단을 위한 보안시스템 운영</li>
                      <li>백신프로그램 설치 및 주기적 점검</li>
                    </ul>
                  </div>
                  
                  <div>
                    <h4 className="font-medium text-gray-800 mb-2">2. 관리적 조치</h4>
                    <ul className="list-disc list-inside space-y-1 text-sm ml-4">
                      <li>개인정보 취급자 지정 및 최소화</li>
                      <li>개인정보 보호 교육 실시</li>
                      <li>내부관리계획 수립 및 시행</li>
                      <li>개인정보 처리시스템 접근권한 관리</li>
                    </ul>
                  </div>
                </div>
              </div>

              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-3">제11조 개인정보 보호책임자</h3>
                <p className="mb-3">회사는 개인정보 처리에 관한 업무를 총괄해서 책임지며, 개인정보 보호 관련 문의를 처리하기 위해 아래와 같이 개인정보 보호책임자를 지정하고 있습니다.</p>
                
                <div className="bg-gray-50 p-4 rounded-lg space-y-4">
                  <div>
                    <h4 className="font-medium text-gray-800 mb-3">회사 정보</h4>
                    <div className="grid md:grid-cols-2 gap-4 text-sm">
                      <div className="space-y-1">
                        <p><strong>회사명:</strong> 이티컴파니</p>
                        <p><strong>대표:</strong> 정영호</p>
                        <p><strong>사업자등록번호:</strong> 262-88-00926</p>
                        <p><strong>통신판매업신고번호:</strong> 2019-전북익산-0012</p>
                      </div>
                      <div className="space-y-1">
                        <p><strong>주소:</strong> 전라북도 익산시 서동로 590 2-C</p>
                        <p><strong>전화:</strong> 063-917-5215</p>
                        <p><strong>팩스:</strong> 063-722-5215</p>
                        <p><strong>이메일:</strong> project307@naver.com</p>
                      </div>
                    </div>
                  </div>
                  
                  <div className="border-t border-gray-200 pt-4">
                    <h4 className="font-medium text-gray-800 mb-2">개인정보 보호책임자</h4>
                    <div className="text-sm space-y-1">
                      <p><strong>성명:</strong> 선민관</p>
                    </div>
                  </div>
                </div>
                
                <p className="text-sm text-gray-600 mt-3">
                  개인정보 보호와 관련된 문의사항이 있으시면 언제든지 위 연락처로 문의하시기 바랍니다. 신속하고 성실하게 답변드리겠습니다.
                </p>
              </div>

              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-3">제12조 권익침해 구제방법</h3>
                <p className="mb-3">개인정보 침해로 인한 신고나 상담이 필요한 경우 아래 기관에 문의하실 수 있습니다:</p>
                
                <div className="grid md:grid-cols-2 gap-4">
                  <div className="bg-gray-50 p-3 rounded">
                    <h4 className="font-medium text-gray-800 mb-2">개인정보보호위원회</h4>
                    <ul className="text-sm space-y-1">
                      <li>홈페이지: privacy.go.kr</li>
                      <li>전화: (국번없이) 182</li>
                    </ul>
                  </div>
                  
                  <div className="bg-gray-50 p-3 rounded">
                    <h4 className="font-medium text-gray-800 mb-2">개인정보 침해신고센터</h4>
                    <ul className="text-sm space-y-1">
                      <li>홈페이지: privacy.kisa.or.kr</li>
                      <li>전화: (국번없이) 118</li>
                    </ul>
                  </div>
                </div>
              </div>

              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-3">제13조 개인정보 처리방침의 변경</h3>
                <div className="space-y-3">
                  <p className="text-sm">이 개인정보 처리방침은 시행일로부터 적용되며, 법령 및 방침에 따른 변경내용의 추가, 삭제 및 정정이 있는 경우에는 변경사항의 시행 7일 전부터 공지사항을 통하여 고지할 것입니다.</p>
                  
                  <div className="bg-blue-50 p-4 rounded-lg">
                    <p className="font-medium text-blue-800 mb-2">현행 개인정보 처리방침</p>
                    <ul className="text-sm text-blue-700 space-y-1">
                      <li><strong>공고일자:</strong> 2025년 7월 31일</li>
                      <li><strong>시행일자:</strong> 2025년 8월 7일</li>
                      <li><strong>버전:</strong> v1.0</li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* 푸터 버튼 */}
          <div className="sticky bottom-0 bg-white border-t border-gray-200 px-6 py-4 flex gap-3 justify-end">
            <button
              onClick={onClose}
              className="px-6 py-2 text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg font-medium transition-colors"
            >
              {onAccept ? '취소' : '확인'}
            </button>
            {onAccept && (
              <button
                onClick={onAccept}
                className="px-6 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg font-medium transition-colors"
              >
                동의하고 진행
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default PrivacyPolicyModal;