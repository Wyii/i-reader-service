'use strict';
const router = require('koa-router')();
const Project = require('../models/Project');
const fileUrlUtil = require('../common/FileUrlUtil');
const ESClientFactory = require('../common/ESClientFactory');
const parse = require('co-body');

const moment = require('moment');
const _ = require('lodash');

const defaultPageSize = 24;
const Utils = require('../utils/Utils');
const client = require('../utils/RedisConnection').get();
const REDIS_SESSION_PREFIX = Utils.REDIS_SESSION_PREFIX;

/**
 * @api {get} /api/project/list 获取资讯列表
 * @apiName list
 * @apiGroup Project
 *
 * @apiSuccessExample {json} Success-Response:
 * []
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
    let mustFilter = [{ term: { isDel: 0 } }];
    let filtered = { filter: { bool: { must: mustFilter } } };
    let query = { filtered: filtered };
    let sort = [];

    if (this.query.channel) {
        let channel = yield Channel.findOne({ _id: this.query.channel });
        if (!channel || (channel.open != 1 && _.indexOf(this.session.account.tenancies, channel.tenancy) == -1)) {
            this.body = [];
            return;
        }
        if (channel.level != 1) {
            mustFilter.push({ term: { channel: this.query.channel } });
        } else {
            let channels = yield Channel.find({ parent: channel._id }, { _id: 1 });
            if (channels.length == 0) {
                mustFilter.push({ term: { channel: this.query.channel } });
            } else {
                mustFilter.push({ terms: { channel: channels.map(c => c._id) } });
                // mustFilter.push({
                //     bool: { should: channels.map(channel => { return { term: { channel: channel._id } } }) }
                // });
            }
        }

        for (let k in this.query) {
            if (k.startsWith('p:')) {
                mustFilter.push({ term: { ["parameters." + k.substring(2)]: this.query[k] } });
            }
        }
    }


    if (this.query.feed) {
        let feedId = this.query.feed;
        let feedIdList;
        if (feedId == 'subscribe') {
            feedIdList = _.map(
                yield Subscribe.find({ account: this.session.account._id }, { feed: 1 }),
                f => f.feed
            );
        } else if (feedId.startsWith('t_')) {
            let topicId = feedId.substring(2);
            feedIdList = _.map(
                yield Subscribe.find({ account: this.session.account._id, topic: topicId }, { feed: 1 }),
                f => f.feed
            );
        } else {
            feedIdList = [feedId];
        }
        mustFilter.push({ terms: { feed: feedIdList } });
    }

    if (this.query.tag) {
        mustFilter.push({ term: { tags: this.query.tag } });
    }

    let kw = this.query.keyword;
    if (kw) {
        if (kw.startsWith('tag:')) {
            kw = kw.substring(4);
            mustFilter.push({ term: { tags: _.lowerCase(kw) } });
        } else {
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

    let projectList = yield Project.find({ _id: { $in: projectIdList } });

    /*
     这一行代码还是必要的 mongo会缓存查询结果。虽然一般情况下，会按照projectIdList的顺序返回list，但是在没有明确指定排序时候并不是一定的。
     */
    projectList = _.sortBy(projectList, p => projectIdList.indexOf(p.id));

    // 查询每个project的feed和channel
    // projectList = yield queryProjectListFeedAndChannel(projectList);

    this.body = projectList || [];
});


/**
 * @api {post} /api/project/toggleCollect 收藏/取消收藏
 * @apiName toggleCollect
 * @apiGroup Project
 *
 * @apiParam {JSON} data {id:'文章id',openId:'用户opendId'}
 *
  * @apiSuccessExample {json} Success-Response:
 * {operator:'add'} / {operator:'cancel'}
 * @apiErrorExample {json} Error-Response:
 * {errmsg:'not fount'}
 */
router.post('/api/project/toggleCollect', function *() {
    let data = yield parse(this);
    let id = data.id;
    let openId = data.openId;

    let project = yield Project.findOne({_id: id, isDel: 0});
    if(!project) {
        this.body = {errmsg: 'not found'};
        return;
    }

    let uid = openId + '#' + project._id;
    let pc = yield ProjectCollect.findOne({_id: uid});
    if (pc) {
        yield pc.remove();
        this.body = {operator: 'cancel'};
    } else {
        yield new ProjectCollect({_id: uid, openId: openId, pid: project._id, collectedDate: new Date()}).save();
        this.body = {operator: 'add'};
    }
});

/**
 * @api {get} /api/project/collections 收藏列表
 * @apiName toggleCollect
 * @apiGroup Project
 *
 * @apiParam {JSON} data {openId:'用户opendId'}
 *
 * @apiSuccessExample {json} Success-Response:
 * []
 */
router.get('/api/project/collections', function* () {

    let page = this.query.page || 1;

    if (page < 1) {
        page = 1;
    } else if (page > 20) {
        page = 20;
    }
    let offset = (page - 1) * defaultPageSize;

    let tags = this.query.tags && this.query.tags.split(',');
    let keyword = this.query.keyword;
    //TODO 这里后续会移除
    let openId = yield client.getAsync(REDIS_SESSION_PREFIX + headers.sessionid);
    let query = { openId: openId };
    if (tags) {
        query.tags = { $all: tags };
    }

    let collected;
    if (keyword && hasFulltext) {
        collected = yield ProjectCollect.find(query, { pid: 1 });
    } else {
        collected = yield ProjectCollect.find(query, { pid: 1 }).sort({ collectedDate: -1 }).skip(offset).limit(defaultPageSize);
    }
    if (!collected || collected.length == 0) {
        this.body = [];
        return;
    }
    let collectedId = _.map(collected, c => c.pid || c._id.split('#')[1]);

    let projectIdList;
    if (keyword && hasFulltext) {

        let es = ESClientFactory.get();
        let sort = [{ "_score": { "order": "desc" } }, { "datePublished": { "order": "desc" } }];
        let query = {
            filtered: {
                filter: {
                    bool: {
                        must: [
                            { term: { isDel: 0 } },
                            { terms: { _id: collectedId } }
                        ]
                    }
                },
                query: {
                    bool: {
                        should: [
                            { match: { title: keyword } },
                            { match: { tags: keyword } },
                            { match: { desc: keyword } },
                            { match: { text: keyword } }
                        ]
                    }
                }
            }
        };

        let plist = (yield es.search({
            index: 'boom',
            type: 'project',
            from: offset,
            size: defaultPageSize,
            body: { query, sort }
        })).hits.hits;

        projectIdList = _.map(plist, p => p._id);
    } else {
        projectIdList = collectedId;
    }

    let projectList = yield Project.find({ _id: { $in: projectIdList } });
    projectList = _.sortBy(projectList, p => projectIdList.indexOf(p.id));

    // projectList = yield queryProjectListFeedAndChannel(projectList);

    this.body = projectList;
});

module.exports = router;