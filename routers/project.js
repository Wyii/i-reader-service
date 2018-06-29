'use strict';
const router = require('koa-router')();
const Project = require('../models/Project');
const ProjectText = require('../models/ProjectText');
const ProjectCollect = require('../models/ProjectCollect');
const Theme = require('../models/Theme');
const DailyNews = require('../models/DailyNews');
const fileUrlUtil = require('../common/FileUrlUtil');
const ESClientFactory = require('../common/ESClientFactory');
const parse = require('co-body');

const moment = require('moment');
const _ = require('lodash');
const cheerio = require('cheerio');

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
    let feedIdList;
    let dailyNewsProject;
    let dailyMappingProject = {};
    if (themeId) {
        if (themeId == 'subscribe') {
            let themeCollectIdList = yield ThemeCollect.find({ openId: openId });
            themeCollectIdList = _.map(themeCollectIdList, t => t._id);
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
                    { match: { title: kw } },
                    { term: { tags: kw } },
                    { match: { desc: kw } },
                    { match: { text: kw } }
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
            feedIdMappingThemeName[feedId] = theme.name;
        }
    }

    let projectCollectIdList = yield ProjectCollect.find({ openId: openId });
    projectCollectIdList = _.map(projectCollectIdList, p => p._id);

    let projectList = yield Project.find({ _id: { $in: projectIdList } });

    let cleanProjectList = [];
    for (let project of projectList) {
        project = project.toObject();
        let feed = project.feed;
        project.theme = feedIdMappingThemeName[feed];
        project.isCollected = false;
        if (projectCollectIdList.indexOf(project._id) != -1) project.isCollected = true;
        cleanProjectList.push(project);
    }

    cleanProjectList = _.sortBy(cleanProjectList, p => projectIdList.indexOf(p.id));
    this.body = cleanProjectList || [];
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
    if (project.type === "wechat") {
        const $ = cheerio.load(text);
        text = $('#js_content').wrap('<p/>').parent().html();
        // json.text = unescape(text.replace(/&#x/g, '%u').replace(/;/g, '')).replace(/%uA0/g, '');
        json.text = text;
    }
    json.likeProjects = yield likeProjects(project);
    this.body = json;
});


// router.get('/api/project/next/:id', function* () {
//     let themeName = this.query.theme;
//     let projectId = this.query.id;
//     let theme = yield Theme.findOne({ name: themeName });
//     let feedIdList = theme.feeds;

//     let es = ESClientFactory.get();
//     let filtered = { filter: { bool: { must: mustFilter } } };
//     let query = { filtered: filtered };
//     let sort = [{ "datePublished": { "order": "desc" } }];

//     let projectIdList = (yield es.search({
//         index: 'boom',
//         type: 'project',
//         from: offset,
//         size: 2,
//         body: { query, sort },
//         _source: false,
//     })).hits.hits;
//     projectIdList = _.map(projectIdList, p => p._id);

//     let projectList = yield Project.find({ _id: { $in: projectIdList } });

//     projectList = _.sortBy(projectList, p => projectIdList.indexOf(p.id));
//     this.body = projectList || [];
// });

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