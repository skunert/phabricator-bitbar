#!/usr/bin/env PATH_TO_NODE
const config = {
    apiToken: 'API_TOKEN',
    authors: ['YOUR_PHID'],
    reviewers: ['REVIEW_PHID'],
    host: 'PHABRICATOR_URL',
    jenkins: 'JENKINS_PHID',
    jenkinsUrlRegEx: /regex/g
};

const axios = require('axios');
const _ = require('lodash');

const BUILD_STATUS = {
    PASSED: 'passed',
    PASSED_INDICATOR: 'Jenkins build has passed',
    IN_PROGRESS: 'inProgress',
    IN_PROGRESS_INDICATOR: 'Started Jenkins Build',
    FAILED: 'failed',
    FAILED_INDICATOR: 'Jenkins build failed.'
}

const queryDiff = async (extraParams) => {
    return axios.get(`https://${config.host}/api/differential.query`, {
        params: {
            status: "status-open",
            'api.token': config.apiToken,
            ...extraParams,
        }
    });
}

const splitComments = (comments) => {
    return ({
        jenkinsComments: comments.filter(comment => comment.authorPHID === config.jenkins),
        devComments: comments.filter(comment => !_.includes([config.jenkins, ...config.authors], comment.authorPHID)),
    });
}

const addBuildStatusInfo = (item) => {
    if (_.isEmpty(item.jenkinsComments)) {
        return;
    }

    const lastComment = _.head(item.jenkinsComments).content.raw;

    const matches = lastComment.match(config.jenkinsUrlRegEx);
    if (!_.isEmpty(matches)) {
        item.buildUrl = _.head(matches);
    }
    if (_.includes(lastComment, BUILD_STATUS.PASSED_INDICATOR)) {
        item.buildStatus = BUILD_STATUS.PASSED;
    } else if (_.includes(lastComment, BUILD_STATUS.IN_PROGRESS_INDICATOR)) {
        item.buildStatus = BUILD_STATUS.IN_PROGRESS;
    } else if (_.includes(lastComment, BUILD_STATUS.FAILED_INDICATOR)) {
        item.buildStatus = BUILD_STATUS.FAILED;
    }
}

const getStatusIcon = (item) => {
    if (item.statusName === "Accepted") {
        return "✅";
    } else if (item.statusName === "Needs Review") {
        return "⏳";
    } else if (item.statusName === "Changes Planned") {
        return "🎧"
    } else if (item.statusName === "Draft") {
        return "📄"
    } else {
        return "❓"
    }
};

const getCommentIcon = (item) => {
    return _.isEmpty(item.devComments) ? '' : item.devComments.length + '💬';
};

const queryComments = async ({phid}) => {
    return axios.get(`https://${config.host}/api/transaction.search`, {
        params: {
            'api.token': config.apiToken,
            'objectIdentifier': phid,
        }
    });
}

const getBuildIcon = (item) => {
    const extractIcon = (status) => {
        switch (status) {
            case BUILD_STATUS.PASSED:
                return "✅";
            case BUILD_STATUS.FAILED:
                return "❌";
            case BUILD_STATUS.IN_PROGRESS:
                return "⏳"
            default:
                return status;
        }
    };

    if (item.buildStatus) {
        return extractIcon(item.buildStatus);
    } else if (item.properties && item.properties.buildables) {
        const status = _.last(Object.entries(item.properties.buildables))[1].status;
        return `${extractIcon(status)}`
    } else {
        return "⏳";
    }
}

(async () => {
    if (!config.apiToken || !config.authors || config.authors.length === 0) {
        console.log("Please edit phabricator-bitbar and add api-token and user-phid.");
        return;
    }


    let queriesToWaitOn = [queryDiff({authors: config.authors})];
    const shouldShowReviewDiffs = config.reviewers && config.reviewers.length > 0;

    if (shouldShowReviewDiffs) {
        queriesToWaitOn = queriesToWaitOn.concat(queryDiff({
            reviewers: config.reviewers,
            status: 'status-needs-review'
        }))
    }

    const [authorDiffResponse, diffsToBeReviewedResponse] = await Promise.all(queriesToWaitOn);

    if (authorDiffResponse.status !== 200 || (shouldShowReviewDiffs && diffsToBeReviewedResponse.status !== 200)) {
        console.log(`Conduit Problem: received status own diffs=${authorDiffResponse.status} reviews=${diffsToBeReviewedResponse.status}`);
        return;
    }

    const authorDiffs = authorDiffResponse.data.result || [];

    const commentResponse = await Promise.all(authorDiffs.map(diff => queryComments({phid: diff.phid})));
    const comments = _(commentResponse).map(input => input.data.result || [])
        .map(transactions => transactions.data.filter(transaction => ['comment', 'inline'].includes(transaction.type)))
        .filter(transactions => !_.isEmpty(transactions))
        .map(transactions => ({
            objectPHID: _.head(transactions).objectPHID,
            comments: transactions.flatMap(t => t.comments)
        }))
        .value();

    const reviewDiffs = (shouldShowReviewDiffs && diffsToBeReviewedResponse.data.result) || [];

    const sortedAuthorDiffs = _(authorDiffs).sortBy(['id'])
        .map(authorDiff => {
            const matchingComments = _.find(comments, ['objectPHID', authorDiff.phid]);
            if (matchingComments) {
                _.assign(authorDiff, splitComments(matchingComments.comments));
                addBuildStatusInfo(authorDiff);
            }
            return authorDiff;
        })
        .value();

    const finalAuthorDiffs = sortedAuthorDiffs.map(item => {
        const result = {
            text: `${getStatusIcon(item)}${getBuildIcon(item)}${getCommentIcon(item)} D${item.id} - ${item.title}`,
            href: item.uri,
            submenu: []
        };
        if (!_.isEmpty(item.devComments)) {
            result.submenu = _.concat(result.submenu, {
                text: `💬 ${item.devComments.length} Comments`
            });
        }
        if (item.buildUrl) {
            result.submenu = _.concat(result.submenu, {
                text: 'Open Jenkins Job',
                href: item.buildUrl
            });
        }
        return result;
    });

    const finalReviewDiffs = reviewDiffs.sort((i1, i2) => i2.id - i1.id)
        .filter(item => !config.authors.includes(item.authorPHID))
        .map(item =>
            ({
                text: `D${item.id} - ${item.title}`,
                href: item.uri,
            })
        ).flat();

    let header;
    if (sortedAuthorDiffs.length > 0) {
        header = {text: sortedAuthorDiffs.map(item => `D${item.id} ${getStatusIcon(item)}${getBuildIcon(item)}${getCommentIcon(item)}`).join(' -- ') + ` (${finalReviewDiffs.length})`};
    } else {
        header = {text: `👀 (${finalReviewDiffs.length})`};
    }

    console.log(header.text);
    console.log('---')

    finalAuthorDiffs?.forEach(authorDiff => {
       console.log(`${authorDiff.text} | href=${authorDiff.href}`);
       authorDiff.submenu?.forEach(submenu => {
           console.log(`-- ${submenu.text} | href=${submenu.href}`);
       })
    })

    if (finalReviewDiffs?.length !== 0) {
        console.log('---');
    }
    finalReviewDiffs?.forEach(reviewDiff => {
        console.log(`${reviewDiff.text} | href=${reviewDiff.href}`);
        reviewDiff.submenu?.forEach(submenu => {
            console.log(`-- ${submenu.text} | href=${submenu.href}`);
        })
    })
})();
