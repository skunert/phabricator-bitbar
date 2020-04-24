# Phabricator-bitbar

This bitbar plugin shows the open diffs from the author and a list of diffs to be reviewed.

## Prerequisites
To use this plugin, you have to have `node` and bitbar installed on your machine. 
To install bitbar, follow the instructions on the [bitbar homepage](https://getbitbar.com/).


### Installing phabricator-bitbar
1. Clone this repository
2. run `npm install` inside the repository
3. Configure your API token and phabricator IDs inside the js file
4. Execute the following command to create a symbolic link from your repo to the bitbar plugin folder:
```shell
ln -s $PHABRICATOR-BITBAR_REPO_LOCATION/phabricator-bitbar.5m.js $BITBAR_PLUGIN_FOLDER/phabricator-bitbar.5m.js
```

### Configuring phabricator-bitbar

For the `host` config, you need to enter the address of the phabricator instance you want to query.

#### Set up your node executable
Bitbar regularly tries to execute the script provided in this repo. In the first line of the script, you need to
specify which node executable should be used.

#### Getting an API key
To access the conduit API, you need an API key.
To generate it:
- Go to your phabricator instance web interface
- Click your profile icon -> settings
- in the left sidebar, you can find "Conduit API Tokens"
- Generate a key and copy it into the config in `phabricator-bitbar.5m.js`

### Find out your user PHID
In your terminal, execute `echo '{}' | arc call-conduit user.whoami`. In the response you see a `phid` field which
you can copy into the `author` field in `phabricator-bitbar.5m.js`.

### Configuring which diffs to show for reviews
In the config you can find a `reviewers` field. You can enter your own phid here to show every diff that shows you as a reviewer. You can also add a phid that identifies your team.

### Configuring the polling interval
You can configure the interval at which the script is called by renaming it. Find more info on this [here](https://github.com/matryer/bitbar#configure-the-refresh-time).
