var fs = require("fs");

function options() {

    this.options = {
        verbose: false,
        username: "",
        password: "",
        openOnly: false,
        team: "",
        allTeams: false,
        project: "",
        createdAfter: "",
        output: false,
        mapping: ""
    };

    this.parse = function(program) {
        this.options.verbose = undefined !== program.verbose ? program.verbose : false;
        this.options.username = undefined !== program.username ? program.username : "";
        this.options.password = undefined !== program.password ? program.password : "";
        this.options.openOnly = undefined !== program.open ? program.open : false;
        this.options.team = undefined !== program.team ? program.team : "";
        this.options.allTeams = undefined !== program['all-teams'] ? program['all-teams'] : false;
        this.options.project = undefined !== program.project ? program.project : "";
        this.options.createdAfter = undefined !== program.created ? program.created : "";
        this.options.output = undefined !== program.output ? program.output: false;
        this.options.mapping = undefined !== program.mapping ? this._getMapping(program.mapping): [];
    };

    this.get = function() {
        return this.options;
    };

    this._getMapping = function(filename) {
        var data;
        var ret = [];
        var stats = fs.statSync(filename);
        if (stats.isFile()) {
            data = fs.readFileSync(filename, {encoding: "UTF-8"});
            ret = JSON.parse(data);
        }
        return ret;
    };
}

module.exports = options;
