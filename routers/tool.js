/**
 * 该路由包含了一些后台所需的处理接口 
*/

const co = require('co');
const Theme = require('../models/Theme');
const DailyNews = require('../models/DailyNews');
const router = require('koa-router')();
const moment = require('moment');


router.get('/api/tool/initTheme', function* () {
    let themeJson = require('../config/theme.json');
    for (let item of themeJson) {
        let name = item.name
        let theme = yield Theme.findOne({ name: name });
        if (theme) {
            yield Theme.update({ name: name }, { $set: { feeds: item.feeds, desc: item.desc, sort: item.sort } });
        } else {
            yield new Theme({ name: name, image: item.image, feeds: item.feeds }).save();

        }
    }
    console.log('update theme');
    this.body = { info: 'update theme' };
});

router.get('/api/tool/initDailyNews', function* () {
    let dailyNewsJson = require('../config/dailyNews.json');
    for (let item of dailyNewsJson) {
        let type = item.type;
        let status = item.status;
        let publishDate;
        if (item.publishDate)
            publishDate = moment(item.publishDate, 'YYYY.M.DD').toDate();
        for (let id of item.ids) {
            let news = yield DailyNews.findOne({ type: type, id: id });
            if (news) {
                yield DailyNews.update({ type: type, id: id }, { $set: { status: status, publishDate: publishDate } });
            } else {
                yield new DailyNews({ type: type, status: status, id: id, publishDate: publishDate }).save();
            }

        }
    }
    console.log('update dailyNews');
    this.body = { info: 'update dailyNews' };
})

module.exports = router;