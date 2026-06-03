export default async function handler(req, res) {
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

  const token = process.env.HF_TOKEN;
  if (!token) {
    return res.status(500).json({ error: 'HF_TOKEN 환경변수가 없습니다.' });
  }

  // feature-extraction 엔드포인트 사용
  const url = 'https://api-inference.huggingface.co/models/sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2';

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 25000);

    const hfRes = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        inputs: text.slice(0, 512),
        options: { wait_for_model: true, use_cache: true }
      }),
      signal: controller.signal
    });

    clearTimeout(timeout);

    const rawText = await hfRes.text();

    if (!hfRes.ok) {
      return res.status(hfRes.status).json({
        error: `HF API 오류 (${hfRes.status})`,
        detail: rawText.slice(0, 200)
      });
    }

    let data;
    try {
      data = JSON.parse(rawText);
    } catch(e) {
      return res.status(500).json({ error: 'HF 응답 파싱 실패', detail: rawText.slice(0, 200) });
    }

    // 응답 형태에 따라 벡터 추출
    let vector;
    if (Array.isArray(data) && Array.isArray(data[0])) {
      // [[vec1], [vec2], ...] 형태 → 평균
      const len = data[0].length;
      const avg = new Array(len).fill(0);
      data.forEach(row => row.forEach((v, i) => { avg[i] += v; }));
      vector = avg.map(v => v / data.length);
    } else if (Array.isArray(data) && typeof data[0] === 'number') {
      // [0.1, 0.2, ...] 형태 → 바로 사용
      vector = data;
    } else {
      return res.status(500).json({
        error: '예상치 못한 응답 형태',
        type: typeof data,
        sample: JSON.stringify(data).slice(0, 200)
      });
    }

    return res.status(200).json({ vector });

  } catch (e) {
    if (e.name === 'AbortError') {
      return res.status(504).json({ error: 'HF API 응답 시간 초과 (25초). 잠시 후 다시 시도해주세요.' });
    }
    return res.status(500).json({ error: `서버 오류: ${e.message}` });
  }
}
