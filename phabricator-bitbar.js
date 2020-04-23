#!/usr/bin/env PATH_TO_NODE_EXECUTABLE
const config = {
    apiToken: null,
    userPhid: null,
    host: null
};


(async () => {
    const bitbar = require('bitbar');
    const axios = require('axios');

    if (!config.apiToken || !config.userPhid) {
        bitbar([{text: "Please edit phabricator-bitbar and add api-token and user-phid."}]);
        return;
    }


    const result = await axios.get(`https://${config.host}/api/differential.query`, {
        params: {
            authors: [config.userPhid],
            status: "status-open",
            'api.token': config.apiToken
        }
    })
    if (result.status !== 200) {
        bitbar([{text: "Conduit Problem: received status " + result.status}]);
        return;
    }
    const getStatusSymbol = (item) => {
        if (item.statusName === "Accepted") {
            return "✅";
        } else if (item.statusName === "Needs Review") {
            return "⏳";
        } else {
            return "❓"
        }
    };
    const getBuildSymbol = (item) => {
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
    let responseData = result.data.result.sort((i1, i2) => i1.id - i2.id);
    const data = responseData.map(item => [{text: `${getStatusSymbol(item)} ${getBuildSymbol(item)} D${item.id} ${item.title}`, href: item.uri}]).flat();
    const header = {text: responseData.map(item => `D${item.id} ${getStatusSymbol(item)}${getBuildSymbol(item)}`).join(' -- ')};

    bitbar([
        header,
        bitbar.separator,
        ...data
    ]);
})();
