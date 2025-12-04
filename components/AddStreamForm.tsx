// components/AddStreamForm.tsx
import React, { useState } from 'react';

interface AddStreamFormProps {
    onSuccess: () => void;
    onCancel: () => void;
}

const AddStreamForm: React.FC<AddStreamFormProps> = ({ onSuccess, onCancel }) => {
    const [formData, setFormData] = useState({
        stream_name: '',
        rtsp_url: '',
        description: ''
    });
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3000';

    const getAuthToken = () => {
        const token = document.cookie
            .split('; ')
            .find(row => row.startsWith('accessToken='))
            ?.split('=')[1];
        return token || localStorage.getItem('accessToken');
    };

    const getAuthHeaders = () => {
        const token = getAuthToken();
        return {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
        };
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        
        if (!formData.stream_name.trim() || !formData.rtsp_url.trim()) {
            setError('스트림 이름과 RTSP URL은 필수입니다.');
            return;
        }

        if (!formData.rtsp_url.startsWith('rtsp://')) {
            setError('RTSP URL은 rtsp://로 시작해야 합니다.');
            return;
        }

        setLoading(true);
        setError(null);

        try {
            const response = await fetch(`${API_BASE}/api/stream-devices`, {
                method: 'POST',
                headers: getAuthHeaders(),
                body: JSON.stringify(formData)
            });

            const data = await response.json();

            if (data.success) {
                alert('스트림이 성공적으로 추가되었습니다!');
                onSuccess();
            } else {
                setError(data.error || '스트림 추가에 실패했습니다.');
            }
        } catch (err: any) {
            console.error('스트림 추가 오류:', err);
            setError(`스트림 추가 실패: ${err.message}`);
        } finally {
            setLoading(false);
        }
    };

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        setFormData(prev => ({
            ...prev,
            [e.target.name]: e.target.value
        }));
    };

    return (
        <div style={{
            backgroundColor: 'white',
            border: '2px solid #28a745',
            borderRadius: '8px',
            padding: '20px',
            marginBottom: '20px',
            boxShadow: '0 4px 12px rgba(40, 167, 69, 0.15)'
        }}>
            <h3 style={{
                margin: '0 0 20px 0',
                color: '#28a745',
                fontSize: '18px',
                fontWeight: '600'
            }}>
                ➕ 새 스트림 추가
            </h3>

            {error && (
                <div style={{
                    color: '#721c24',
                    backgroundColor: '#f8d7da',
                    border: '1px solid #f5c6cb',
                    borderRadius: '4px',
                    padding: '10px',
                    marginBottom: '15px',
                    fontSize: '14px'
                }}>
                    ⚠️ {error}
                </div>
            )}

            <form onSubmit={handleSubmit}>
                <div style={{ marginBottom: '15px' }}>
                    <label style={{
                        display: 'block',
                        marginBottom: '5px',
                        fontWeight: '600',
                        color: '#495057'
                    }}>
                        스트림 이름 *
                    </label>
                    <input
                        type="text"
                        name="stream_name"
                        value={formData.stream_name}
                        onChange={handleChange}
                        placeholder="예: 메인 CCTV"
                        required
                        style={{
                            width: '100%',
                            padding: '10px',
                            border: '1px solid #ced4da',
                            borderRadius: '4px',
                            fontSize: '14px'
                        }}
                    />
                </div>

                <div style={{ marginBottom: '15px' }}>
                    <label style={{
                        display: 'block',
                        marginBottom: '5px',
                        fontWeight: '600',
                        color: '#495057'
                    }}>
                        RTSP URL *
                    </label>
                    <input
                        type="text"
                        name="rtsp_url"
                        value={formData.rtsp_url}
                        onChange={handleChange}
                        placeholder="rtsp://username:password@ip:port/path"
                        required
                        style={{
                            width: '100%',
                            padding: '10px',
                            border: '1px solid #ced4da',
                            borderRadius: '4px',
                            fontSize: '14px'
                        }}
                    />
                </div>

                <div style={{ marginBottom: '20px' }}>
                    <label style={{
                        display: 'block',
                        marginBottom: '5px',
                        fontWeight: '600',
                        color: '#495057'
                    }}>
                        설명 (선택사항)
                    </label>
                    <textarea
                        name="description"
                        value={formData.description}
                        onChange={handleChange}
                        placeholder="스트림에 대한 설명을 입력하세요"
                        rows={3}
                        style={{
                            width: '100%',
                            padding: '10px',
                            border: '1px solid #ced4da',
                            borderRadius: '4px',
                            fontSize: '14px',
                            resize: 'vertical'
                        }}
                    />
                </div>

                <div style={{
                    display: 'flex',
                    gap: '10px',
                    justifyContent: 'flex-end'
                }}>
                    <button
                        type="button"
                        onClick={onCancel}
                        disabled={loading}
                        style={{
                            padding: '10px 20px',
                            backgroundColor: '#6c757d',
                            color: 'white',
                            border: 'none',
                            borderRadius: '4px',
                            cursor: loading ? 'not-allowed' : 'pointer',
                            fontWeight: '500'
                        }}
                    >
                        취소
                    </button>
                    <button
                        type="submit"
                        disabled={loading}
                        style={{
                            padding: '10px 20px',
                            backgroundColor: loading ? '#6c757d' : '#28a745',
                            color: 'white',
                            border: 'none',
                            borderRadius: '4px',
                            cursor: loading ? 'not-allowed' : 'pointer',
                            fontWeight: '500'
                        }}
                    >
                        {loading ? '추가 중...' : '스트림 추가'}
                    </button>
                </div>
            </form>
        </div>
    );
};

export default AddStreamForm;