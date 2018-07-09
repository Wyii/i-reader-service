'use strict';
const router = require('koa-router')();
const Project = require('../models/Project');
const ProjectText = require('../models/ProjectText');
const ProjectCollect = require('../models/MobileProjectCollect');
const ProjectNote = require('../models/MobileProjectNote');
const ThemeCollect = require('../models/ThemeCollect');
const Theme = require('../models/Theme');
const DailyNews = require('../models/DailyNews');
const ESClientFactory = require('../common/ESClientFactory');
const parse = require('co-body');

const moment = require('moment');
const _ = require('lodash');
const cheerio = require('cheerio');
const jsdom = require("jsdom");
const { JSDOM } = jsdom;

const defaultPageSize = 24;
const Utils = require('../utils/Utils');
const client = require('../utils/RedisConnection').get();
const REDIS_SESSION_PREFIX = Utils.REDIS_SESSION_PREFIX;

/**
 * @api {get} /api/project/list 获取资讯列表
 * @apiName list
 * @apiGroup Project
 * @apiHeader {String} sessionid
 * @apiParam {Number{1..40}} page =1 分页参数
 * @apiParam {String} themeId 主题ID，如果不传，返回精选资讯;如果themeId='subscribe',返回我订阅的主题文章
 * @apiParam {String} keyword 非必须，查询参数
 * @apiSuccessExample {json} Success-Response:
 * [{}]
 */
router.get('/api/project/list', function* () {
    let page = parseInt(this.query.page) || 1;
    if (page < 1) {
        page = 1;
    } else if (page > 40) {
        this.body = [];
        return;
    }

    let es = ESClientFactory.get();
    let mustFilter = [{ term: { isDel: 0 } }, { term: { type: 'wechat' } }];
    let filtered = { filter: { bool: { must: mustFilter } } };
    let query = { filtered: filtered };
    let sort = [];

    let openId = this.openId;
    let themeId = this.query.themeId;
    let feedIdList = [];
    if (themeId) {
        if (themeId == 'subscribe') {
            let themeCollectIdList = yield ThemeCollect.find({ openId: openId });
            themeCollectIdList = _.map(themeCollectIdList, t => t.tid);
            let themeList = yield Theme.find({ _id: { $in: themeCollectIdList } });
            for (let theme of themeList) {
                feedIdList = _.concat(feedIdList, theme.feeds);
            }
        } else {
            let theme = yield Theme.findOne({ _id: themeId });
            feedIdList = theme.feeds;
        }
    } else {
        let dailyNewsIdList = yield DailyNews.find({ type: 'feed', status: 1 });
        feedIdList = _.map(dailyNewsIdList, t => t.id);
    }
    mustFilter.push({ terms: { feed: feedIdList } });

    let kw = this.query.keyword;
    if (kw) {
        filtered.query = {
            bool: {
                should: [
                    { match: { title: kw } }
                ]
            }
        };
        sort.push({ "_score": { "order": "desc" } });
    }

    sort.push({ "datePublished": { "order": "desc" } });

    let offset = (page - 1) * defaultPageSize;
    let projectIdList = (yield es.search({
        index: 'boom',
        type: 'project',
        from: offset,
        size: defaultPageSize,
        body: { query, sort },
        _source: false,
    })).hits.hits;
    projectIdList = _.map(projectIdList, p => p._id);


    //查询主题名称
    let themeList = yield Theme.find({});
    let feedIdMappingThemeName = {};
    for (let theme of themeList) {
        let feedInThemeList = theme.feeds;
        for (let feedId of feedInThemeList) {
            feedIdMappingThemeName[feedId] = theme._id.toString();
        }
    }
    let themeIdMapping = _.keyBy(themeList, function (item) { return item._id.toString() });

    let projectCollectIdList = yield ProjectCollect.find({ openId: openId });
    projectCollectIdList = _.map(projectCollectIdList, p => p.pid);

    let projectList = yield Project.find({ _id: { $in: projectIdList } });

    let cleanProjectList = [];
    let cleanThemeMapping = {};
    for (let project of projectList) {
        project = project.toObject();
        let feed = project.feed;
        project.themeId = feedIdMappingThemeName[feed];
        let theme = themeIdMapping[project.themeId];
        if (theme) cleanThemeMapping[project.themeId] = { _id: theme._id, name: theme.name, desc: theme.desc };
        project.isCollected = false;
        if (projectCollectIdList.indexOf(project._id.toString()) != -1) project.isCollected = true;
        cleanProjectList.push(project);
    }

    cleanProjectList = _.sortBy(cleanProjectList, p => projectIdList.indexOf(p.id));
    this.body = { projectList: cleanProjectList, themeList: cleanThemeMapping };
});

/**
 * @api {post} /api/project/toggleCollect 收藏/取消收藏
 * @apiName toggleCollect
 * @apiGroup Project
 *
 * @apiParamExample {JSON} Request-Example:
 * {id:'文章id'}
 * @apiHeader {String} sessionid
  * @apiSuccessExample {json} Success-Response:
 * {operator:'add'} / {operator:'cancel'}
 * @apiErrorExample {json} Error-Response:
 * {errmsg:'not fount'}
 */
router.post('/api/project/toggleCollect', function* () {
    let data = yield parse(this);
    let openId = this.openId;
    let id = data.id;

    let project = yield Project.findOne({ _id: id, isDel: 0 });
    if (!project) {
        this.body = { errmsg: 'not found' };
        return;
    }
    let uid = openId + '#' + project._id;
    let pc = yield ProjectCollect.findOne({ _id: uid });
    if (pc) {
        yield pc.remove();
        this.body = { operator: 'cancel' };
    } else {
        yield new ProjectCollect({ _id: uid, openId: openId, pid: project._id, collectedDate: new Date() }).save();
        this.body = { operator: 'add' };
    }
});

/**
 * @api {get} /api/project/detail/:id 文章详情
 * @apiName project detail
 * @apiGroup Project
* @apiHeader {String} sessionid
 * @apiParam {String} id 文章id.
 * @apiSuccessExample {json} Success-Response:
 * {}
 */
router.get('/api/project/detail/:id', function* () {
    let id = this.params.id;
    let openId = this.openId;
    let project;
    project = yield Project.findOne({ _id: id, isDel: 0 }, {
        originViews: 0,
        originLikes: 0,
        originForwards: 0,
        originShares: 0
    });
    if (!project) {
        this.body = {};
        return;
    }
    let json = project.toObject();

    let collection = yield ProjectCollect.findOne({ _id: openId + '#' + project._id });
    json.isCollected = collection ? true : false;

    let text = yield ProjectText.findOne({ _id: project._id });
    text = text && text.text;
    json.text = text;
    let noText = (!text && text == "null" && text == undefined);
    if (noText) {
        json.text = "";
    } else if (project.type === "wechat") {
        const dom = new JSDOM(text);
        // const $ = cheerio.load(text);
        // text = $('#js_content').wrap('<p/>').parent().html();
        // json.text = unescape(text.replace(/&#x/g, '%u').replace(/;/g, '')).replace(/%uA0/g, '');
        json.text = dom.window.document.querySelector("#js_content").outerHTML;
    }
    json.likeProjects = yield likeProjects(project);
    json.notes = yield getNotes(openId, project._id);
    this.body = json;
});

/**
 * @api {post} /api/project/note 笔记
 * @apiName toggleCollect
 * @apiGroup Project
 *
 * @apiParamExample {JSON} Request-Example:
 * {id:'文章id','domIndex':'页面元素下标',text:'标注的文本',note:'用户自定义的文字'}
 * @apiHeader {String} sessionid
  * @apiSuccessExample {json} Success-Response:
 * {operator:'add'} / {operator:'cancel'}
 * @apiErrorExample {json} Error-Response:
 * {errmsg:'not fount'}
 */
router.post('/api/project/note', function* () {
    let data = yield parse(this);
    let openId = this.openId;
    let id = data.id;
    let domIndex = data.domIndex;
    let text = data.text;
    let note = data.note;
    let uid = openId + '#' + id + '#' + domIndex;
    let projectNote = yield ProjectNote.findOne({ _id: uid });
    if (projectNote) {
        yield projectNote.remove();
        this.body = { operator: 'cancel' };
    } else {
        yield new ProjectNote({ _id: uid, openId: openId, pid: id, notedDate: new Date(), text: text, note: note, domIndex: domIndex }).save();
        this.body = { status: true, operator: 'add' };
    }

});

function* getNotes(openId, pid) {
    let projectNoteIndexList = yield ProjectNote.find({ openId, pid });
    projectNoteIndexList = _.map(projectNoteIndexList, n => n.domIndex);
    return projectNoteIndexList;
}


function* likeProjects(project) {
    let mustFilter = [{ term: { isDel: 0 } }, { term: { type: 'wechat' } }, { term: { feed: project.feed } }];
    let filtered = {
        filter: {
            bool: {
                must: mustFilter,
                must_not: [{ term: { _id: project.id } }]
            }
        }
    };
    let query = { filtered };

    let es = ESClientFactory.get();
    let projectIdList = (yield es.search({
        index: 'boom',
        type: 'project',
        from: 0,
        size: 2,
        body: { query },
        _source: false
    })).hits.hits;
    projectIdList = _.map(projectIdList, p => p._id);

    let projectList = yield Project.find({ _id: { $in: projectIdList } });

    return projectList;
}

module.exports = router;