/**
 * 该路由包含了主题订阅处理相关方法 
*/

const co = require('co');
const Theme = require('../models/Theme');
const ThemeCollect = require('../models/ThemeCollect');
const router = require('koa-router')();
const defaultPageSize = 10;
const _ = require('lodash');

/**
 * @api {get} /api/theme/list 主题列表
 * @apiName list
 * @apiGroup Theme
 * @apiHeader {String} sessionid
 * @apiParam {Number{1..40}} page =1 分页参数
 * @apiSuccessExample {json} Success-Response:
 * [{}]
 */
router.get('/api/theme/list', function* () {
    let page = parseInt(this.query.page) || 1;
    if (page < 1) {
        page = 1;
    } else if (page > 40) {
        this.body = [];
        return;
    }
    let skip = (page - 1) * defaultPageSize;
    let themeList = yield Theme.find({}).limit(defaultPageSize).skip(skip);
    let result = [];
    for (let theme of themeList) {
        result.push({ name: theme.name, _id: theme._id });
    }
    this.body = result;
});

/**
 * @api {post} /api/theme/toggleCollect 收藏/取消收藏
 * @apiName toggleCollect
 * @apiGroup Theme
 *
 * @apiParamExample {JSON} Request-Example:
 * {id:'主题id'}
 * @apiHeader {String} sessionid
  * @apiSuccessExample {json} Success-Response:
 * {operator:'add'} / {operator:'cancel'}
 * @apiErrorExample {json} Error-Response:
 * {errmsg:'not fount'}
 */
router.post('/api/theme/toggleCollect', function* () {
    let data = yield parse(this);
    let openId = this.openId;

    let theme = yield Theme.findOne({ _id: id });
    if (!theme) {
        this.body = { errmsg: 'not found' };
        return;
    }
    let uid = openId + '#' + theme._id;
    let tc = yield ThemeCollect.findOne({ _id: uid });
    if (tc) {
        yield tc.remove();
        this.body = { operator: 'cancel' };
    } else {
        yield new ThemeCollect({ _id: uid, openId: openId, tid: theme._id, collectedDate: new Date() }).save();
        this.body = { operator: 'add' };
    }
});

module.exports = router;