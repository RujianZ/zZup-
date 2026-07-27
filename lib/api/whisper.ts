import { supabase, supabaseUrl, supabaseAnonKey } from '../supabase';

/**
 * 🎤 应用内 Whisper 语音转文字 (Speech-To-Text) 接口
 * 将移动端录制的音频 Blob / M4A 极速转换为精准文字
 */
export async function transcribeAudio(
  audioUri: string
): Promise<{ text: string | null; error: string | null }> {
  try {
    const ext = audioUri.split('.').pop() ?? 'm4a';
    const response = await fetch(audioUri);
    const blob = await response.blob();
    
    const formData = new FormData();
    formData.append('file', blob as any, `audio.${ext}`);
    formData.append('model', 'whisper-1');

    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token;

    const res = await fetch(`${supabaseUrl}/functions/v1/whisper-stt`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token || supabaseAnonKey}`,
      },
      body: formData,
    });

    if (!res.ok) {
      const errJson = await res.json().catch(() => ({}));
      return { text: null, error: errJson.error || 'Failed to transcribe audio' };
    }

    const data = await res.json();
    return { text: data.text || null, error: null };
  } catch (err: any) {
    return { text: null, error: err.message || 'Network error during speech-to-text' };
  }
}
