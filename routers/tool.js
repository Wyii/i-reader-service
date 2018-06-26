/**
 * 该路由包含了一些后台所需的处理接口 
*/

const co = require('co');
const Theme = require('../models/Theme');
const router = require('koa-router')();

let data = "创意文案、设计艺术、文艺生活、摄影美图、时尚美妆、最热资讯、互联网科技、电影电视剧、旅行、游戏";


router.get('/api/tool/initTheme', function* () {
    let themeJson = require('../config/theme.json');
    // let dataList = data.split('、');
    for (let item of themeJson) {
        let name = item.name
        let theme = yield Theme.findOne({ name: name });
        if (theme) {
            yield Theme.update({ name: name }, { $set: { feeds: item.feeds } });
        } else {
            yield new Theme({ name: name, image: item.image, feeds: item.feeds }).save();

        }
    }
    console.log('update theme');
    this.body = { info: 'update theme' };
});

module.exports = router;