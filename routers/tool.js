const co = require('co');
const Theme = require('../models/Theme');
const router = require('koa-router')();

let data = "创意文案、设计艺术、文艺生活、摄影美图、时尚美妆、最热资讯、互联网科技、电影电视剧、旅行、游戏";


router.get('/api/tool/initTheme', function* () {
    let dataList = data.split('、');
    for (let item of dataList) {
        let name = item.trim();
        let theme = Theme.find({ name: name });
        if (theme) continue;
        yield new Theme({ name: name, image: '', feeds: [] }).save();
    }
    console.log('update theme');
    this.body = {info:'update theme'};
});

module.exports = router;