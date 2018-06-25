'use strict';
const router = require('koa-router')();
const config = require('config');
const moment = require('moment');
const rp = require('request-promise');
const Project = require('../models/Project');
const ThemeCollect = require('../models/ThemeCollect');
const ProjectNote = require('../models/ProjectNote');
const ProjectCollect = require('../models/ProjectCollect');
const defaultPageSize = 24;
const _ = require('lodash');

/**
 * @api {get} /api/user/info info
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
 * @api {get} /api/projectCollect/list 文章收藏列表
 * @apiName project collect list
 * @apiGroup User
 * @apiHeader {String} sessionid
 * @apiParam {Number} page 分页参数
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
    projectIdList = _.map(projectIdList, p => p._id);

    let projectList = yield Project.find({ _id: { $in: projectIdList } });
    projectList = _.sortBy(projectList, p => projectIdList.indexOf(p.id));
    this.body = projectList || [];
});

/**
 * @api {get} /api/projectNote/list 文章标注列表
 * @apiName project note list
 * @apiGroup User
 * @apiHeader {String} sessionid
 * @apiParam {Number} page 分页参数
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
 * @api {get} /api/themeCollect/list 文章标注列表
 * @apiName theme collect list
 * @apiGroup User
 * @apiHeader {String} sessionid
 * @apiParam {Number} page 分页参数
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
    themeCollectIdList = _.map(themeCollectIdList, t => t._id);
    let themeCollect = ThemeCollect.find({ _id: { $in: themeCollectIdList } });
    this.body = themeCollect || [];
});

module.exports = router;