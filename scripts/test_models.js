const fs = require('fs');
const content = fs.readFileSync('.env.local', 'utf-8');
const keyMatch = content.match(/GEMINI_API_KEY=(.*)/);
const key = keyMatch ? keyMatch[1].trim() : '';

const models = [
  'gemini-3.5-flash',
  'gemini-3.5-flash-lite',
  'gemini-3.1-flash-lite',
  'gemini-2.5-pro',
  'gemini-3.8-flash'
];

async function testAll() {
  for (const m of models) {
    try {
      const res = await fetch('https://generativelanguage.googleapis.com/v1beta/models/' + m + ':generateContent?key=' + key, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: 'Respond with OK' }] }] })
      });
      const data = await res.json();
      if (res.ok) {
        console.log('SUCCESS with model:', m, '=>', data.candidates?.[0]?.content?.parts?.[0]?.text?.trim());
      } else {
        console.log('FAILED with model:', m, data.error?.code, data.error?.message?.slice(0, 80));
      }
    } catch (e) {
      console.log('ERR', m, e.message);
    }
  }
}

testAll();
