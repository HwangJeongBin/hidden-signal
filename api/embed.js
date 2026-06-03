const HF_MODEL = 'sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2';

export default async function handler(req, res) {
  // CORS 설정 — 같은 도메인에서만 허용
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: '허용되지 않는 메서드입니다.' });
  }

  const { text } = req.body;
  if (!text || typeof text !== 'string') {
    return res.status(400).json({ error: '텍스트를 입력해주세요.' });
  }

  // 토큰은 Vercel 환경변수에서만 읽음 — 클라이언트에 절대 노출되지 않음
  const token = process.env.HF_TOKEN;
  if (!token) {
    return res.status(500).json({ error: '서버 설정 오류입니다.' });
  }

  try {
    const response = await fetch(
      'https://api-inference.huggingface.co/pipeline/feature-extraction/' + HF_MODEL,
      {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer ' + token,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          inputs: text.slice(0, 512),
          options: { wait_for_model: true }
        })
      }
    );

    if (!response.ok) {
      const err = await response.text();
      return res.status(response.status).json({ error: 'HF API 오류: ' + err });
    }

    const data = await response.json();

    // 2차원 배열로 오는 경우 토큰별 벡터를 평균내어 문장 벡터로 변환
    let vector;
    if (Array.isArray(data[0])) {
      const len = data[0].length;
      const avg = new Array(len).fill(0);
      data.forEach(row => row.forEach((v, i) => { avg[i] += v; }));
      vector = avg.map(v => v / data.length);
    } else {
      vector = data;
    }

    return res.status(200).json({ vector });
  } catch (e) {
    return res.status(500).json({ error: '서버 오류: ' + e.message });
  }
}
