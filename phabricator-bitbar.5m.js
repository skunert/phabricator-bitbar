#!/usr/bin/env PATH_TO_NODE
const config = {
    apiToken: 'API_TOKEN',
    authors: ['YOUR_PHID'],
    reviewers: ['REVIEW_PHID'],
    host: 'PHABRICATOR_URL'
};

const bitbar = require('bitbar');
const axios = require('axios');

const queryDiff = async (extraParams) => {
    return axios.get(`https://${config.host}/api/differential.query`, {
        params: {
            ...extraParams,
            status: "status-open",
            'api.token': config.apiToken
        }
    });
}

const getStatusIcon = (item) => {
    if (item.statusName === "Accepted") {
        return "✅";
    } else if (item.statusName === "Needs Review") {
        return "⏳";
    } else {
        return "❓"
    }
};

const getBuildIcon = (item) => {
    if (item.properties && item.properties.buildables) {
        const buildables = Object.entries(item.properties.buildables);
        let status = buildables[buildables.length - 1][1].status;
        if (status === "passed") {
            return "✅";
        } else if (status === "failed") {
            return ":x:";
        }
        return ` ${status} `
    } else {
        return "⏳";
    }
}

(async () => {
    if (!config.apiToken || !config.authors || config.authors.length === 0) {
        bitbar([{text: "Please edit phabricator-bitbar and add api-token and user-phid."}]);
        return;
    }


    let queriesToWaitOn = [queryDiff({authors: config.authors})];
    const shouldShowReviewDiffs = config.reviewers && config.reviewers.length > 0;

    if (shouldShowReviewDiffs) {
        queriesToWaitOn = queriesToWaitOn.concat(queryDiff({reviewers: config.reviewers}))
    }

    const [authorDiffResponse, diffsToBeReviewedResponse] = await Promise.all(queriesToWaitOn);

    if (authorDiffResponse.status !== 200 || (shouldShowReviewDiffs && diffsToBeReviewedResponse.status !== 200)) {
        bitbar([{text: `Conduit Problem: received status own diffs=${authorDiffResponse.status} reviews=${diffsToBeReviewedResponse.status}`}]);
        return;
    }

    const authorDiffs = authorDiffResponse.data.result || [] ;
    const reviewDiffs = (shouldShowReviewDiffs && diffsToBeReviewedResponse.data.result) || [];

    const sortedAuthorDiffs = authorDiffs.sort((i1, i2) => i2.id - i1.id);
    let header;
    if (sortedAuthorDiffs.length > 0) {
        header = {text: sortedAuthorDiffs.map(item => `D${item.id} ${getStatusIcon(item)}${getBuildIcon(item)}`).join(' -- ')};
    } else {
        header = {text: "👀"};
    }

    const finalAuthorDiffs = sortedAuthorDiffs.map(item => [{text: `${getStatusIcon(item)}${getBuildIcon(item)} D${item.id} ${item.title}`, href: item.uri}]).flat();
    const finalReviewDiffs = reviewDiffs.sort((i1, i2) => i2.id - i1.id).map(item => [{text: `D${item.id} ${item.title}`, href: item.uri}]).flat();

    bitbar([
        header,
        bitbar.separator,
        ...finalAuthorDiffs,
        bitbar.separator,
        ...finalReviewDiffs
    ]);
})();
