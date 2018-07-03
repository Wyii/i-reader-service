'use strict';
const router = require('koa-router')();
const config = require('config');
const moment = require('moment');
const rp = require('request-promise');
const Project = require('../models/Project');
const ThemeCollect = require('../models/ThemeCollect');
const Theme = require('../models/Theme');
const ProjectNote = require('../models/MobileProjectNote');
const ProjectCollect = require('../models/MobileProjectCollect');
const defaultPageSize = 24;
const _ = require('lodash');

/**
 * @api {get} /api/user/info 用户信息
 * @apiName info
 * @apiGroup User
 * @apiHeader {String} sessionid
 * @apiSuccessExample {json} Success-Response:
 * { projectCollectCount : 0, projectNoteCount : 0, themeCollectCount:0 }
 */
router.get('/api/user/info', function* () {
    let openId = this.openId;
    let projectCollectCount = yield ProjectCollect.count({ openId: openId });
    let projectNoteCount = yield ProjectNote.count({ openId: openId });
    let themeCollectCount = yield ThemeCollect.count({ openId: openId });
    this.body = { projectCollectCount, projectNoteCount, themeCollectCount };
});

/**
 * @api {get} /api/projectCollect/list 收藏列表
 * @apiName project collect list
 * @apiGroup User
 * @apiHeader {String} sessionid
 * @apiParam {Number{1..40}} page =1 分页参数
 * @apiSuccessExample {json} Success-Response:
 * [{}]
 */
router.get('/api/projectCollect/list', function* () {
    let page = parseInt(this.query.page) || 1;
    if (page < 1) {
        page = 1;
    } else if (page > 40) {
        this.body = [];
        return;
    }
    let offset = (page - 1) * defaultPageSize;
    let openId = this.openId;
    let projectIdList = yield ProjectCollect.find({ openId: openId }).sort({ collectedDate: -1 }).limit(defaultPageSize).skip(offset);
    projectIdList = _.map(projectIdList, p => p.pid);

    let projectList = yield Project.find({ _id: { $in: projectIdList } });
    projectList = _.sortBy(projectList, p => projectIdList.indexOf(p.id));
    this.body = projectList || [];
});

/**
 * @api {get} /api/projectNote/list 标注列表
 * @apiName project note list
 * @apiGroup User
 * @apiHeader {String} sessionid
 * @apiParam {Number{1..40}} page =1 分页参数
 * @apiSuccessExample {json} Success-Response:
 * [{}]
 */
router.get('/api/projectNote/list', function* () {
    let page = parseInt(this.query.page) || 1;
    if (page < 1) {
        page = 1;
    } else if (page > 40) {
        this.body = [];
        return;
    }
    let offset = (page - 1) * defaultPageSize;
    let openId = this.openId;
    let projectNote = yield ProjectNote.find({ openId: openId }).sort({ notedDate: -1 }).limit(defaultPageSize).skip(offset);
    this.body = projectNote || [];
});

/**
 * @api {get} /api/themeCollect/list 关注主题列表
 * @apiName theme collect list
 * @apiGroup User
 * @apiHeader {String} sessionid
 * @apiParam {Number{1..40}} page =1 分页参数
 * @apiSuccessExample {json} Success-Response:
 * [{}]
 */
router.get('/api/themeCollect/list', function* () {
    let page = parseInt(this.query.page) || 1;
    if (page < 1) {
        page = 1;
    } else if (page > 40) {
        this.body = [];
        return;
    }
    let offset = (page - 1) * defaultPageSize;
    let openId = this.openId;
    let themeCollectIdList = yield ThemeCollect.find({ openId: openId }).sort({ notedDate: -1 }).limit(defaultPageSize).skip(offset);
    themeCollectIdList = _.map(themeCollectIdList, t => t.tid);
    let themeList = yield Theme.find({ _id: { $in: themeCollectIdList } });
    for (let theme of themeList) {
        theme = theme.toObject();
        theme.isCollect = true;
    }
    this.body = themeList || [];
});

module.exports = router;