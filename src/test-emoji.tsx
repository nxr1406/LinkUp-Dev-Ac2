const code1 = '1f468-200d-1f469-200d-1f467-200d-1f466';
const url1 = `https://cdn.jsdelivr.net/npm/emoji-datasource-apple/img/apple/64/${code1}.png`;

const code2 = '1f44b-1f3fd';
const url2 = `https://cdn.jsdelivr.net/npm/emoji-datasource-apple/img/apple/64/${code2}.png`;

Promise.all([fetch(url1), fetch(url2)]).then(res => console.log(res.map(r => r.status)));
