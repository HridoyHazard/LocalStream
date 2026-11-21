const Database = require('better-sqlite3');
const db = new Database('data/localstream.db', { readonly: true });
console.log(db.prepare('select kind, count(*) c from titles group by kind').all());
console.log(db.prepare("select title, category, kind from titles where kind = 'series' limit 10").all());
console.log(db.prepare("select count(*) c from titles where title like '%1080p%'").get());
console.log(db.prepare("select title, category from titles where title like '%1080p%' limit 5").all());
console.log(db.prepare("select title, category from titles where category = 'English Movies' limit 5").all());
