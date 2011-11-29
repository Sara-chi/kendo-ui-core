// Imports ====================================================================
var fs = require("fs"),
    sys = require("sys"),
    path = require("path"),
    themes = require("./themes"),
    cssmin = require("./lib/cssmin").cssmin,
    kendoBuild = require("./kendo-build"),
    kendoExamples = require("./examples"),
    kendoScripts = require("./kendo-scripts"),
    copyDir = kendoBuild.copyDirSyncRecursive,
    processFiles = kendoBuild.processFilesRecursive,
    mkdir = kendoBuild.mkdir,
    readText = kendoBuild.readText,
    template = kendoBuild.template,
    writeText = kendoBuild.writeText,
    zip = kendoBuild.zip;

// Configuration ==============================================================
var bundles = [{
    name: "kendoui.web-dataviz",
    suites: ["web", "dataviz"],
    license: "commercial",
    eula: "EULA-Kendo.pdf",
    hasSource: true
}, {
    name: "kendoui.web-dataviz",
    suites: ["web", "dataviz"],
    license: "trial",
    eula: "EULA-Kendo.pdf",
    hasSource: false
}, {
    name: "kendoui.web-dataviz",
    suites: ["web", "dataviz"],
    license: "open-source",
    eula: "EULA-Kendo.pdf",
    hasSource: true
}];

var VERSION = kendoBuild.generateVersion(),
    INDEX = "index.html",
    SCRIPTS_ROOT = "src",
    STYLES_ROOT = "styles",
    DEMOS_ROOT = path.join("demos", "examples"),
    TEMPLATES_ROOT = path.join("build", "templates"),
    SUITE_INDEX = path.join(TEMPLATES_ROOT, "suite-index.html"),
    BUNDLE_INDEX = path.join(TEMPLATES_ROOT, "bundle-index.html"),
    EXAMPLES_NAVIGATION = "kendo.examples.nav.js",
    SHARED_ROOT = "shared",
    LEGAL_ROOT = path.join("resources", "legal"),
    SRC_LICENSE = "src-license.txt",
    THIRD_PARTY_LICENSES = "licenses.txt",
    DROP_LOCATION = "release",
    DEPLOY_ROOT = "deploy",
    DEPLOY_SOURCE = "source",
    DEPLOY_SCRIPTS = "js",
    DEPLOY_STYLES = "styles",
    DEPLOY_EXAMPLES = "examples",
    DEPLOY_ONLINEEXAMPLES = "online-examples",
    ONLINE_EXAMPLES_PACKAGE = "kendoui-online-examples.zip";

// Implementation ==============================================================
var startDate = new Date();

function initWorkspace() {
    kendoBuild.rmdirSyncRecursive(DEPLOY_ROOT);

    mkdir(DEPLOY_ROOT);
    mkdir(DROP_LOCATION);
}

function deployScripts(root, license, copySource) {
    var scriptsDest = path.join(root, DEPLOY_SCRIPTS),
        sourceRoot = path.join(root, DEPLOY_SOURCE),
        sourceDest = path.join(sourceRoot, DEPLOY_SCRIPTS);

    mkdir(scriptsDest);
    kendoScripts.deployScripts(SCRIPTS_ROOT, scriptsDest, license, true);

    if (copySource) {
        mkdir(sourceRoot);
        mkdir(sourceDest);
        kendoScripts.deployScripts(SCRIPTS_ROOT, sourceDest, license, false);
    }
}

function deployStyles(root, license, copySource) {
    var stylesDest = path.join(root, DEPLOY_STYLES),
        sourceRoot = path.join(root, DEPLOY_SOURCE),
        sourceDest = path.join(sourceRoot, DEPLOY_STYLES);

    mkdir(stylesDest);
    copyDir(STYLES_ROOT, stylesDest, false, /\.(css|png|jpg|jpeg|gif)$/i);
    processFiles(stylesDest, /\.css$/, function(fileName) {
        var css = kendoBuild.stripBOM(readText(fileName)),
            minified = license + cssmin(css);

        writeText(fileName, minified);
        fs.renameSync(fileName, fileName.replace(".css", ".min.css"));
    });
    kendoBuild.rmdirSyncRecursive(path.join(stylesDest, "mobile"));

    if (copySource) {
        mkdir(sourceRoot);
        mkdir(sourceDest);

        copyDir(STYLES_ROOT, sourceDest, false, /\.(less|css|png|jpg|jpeg|gif)$/i);
        processFiles(sourceDest, /\.(less|css)$/, function(fileName) {
            var css = license + kendoBuild.stripBOM(readText(fileName));

            writeText(fileName, css);
        });
        kendoBuild.rmdirSyncRecursive(path.join(sourceDest, "mobile"));
    }
}

function deployLicenses(root, bundle) {
    kendoBuild.copyFileSync(
        path.join(LEGAL_ROOT, bundle.eula),
        path.join(root, bundle.eula)
    );

    kendoBuild.copyFileSync(
        path.join(LEGAL_ROOT, THIRD_PARTY_LICENSES),
        path.join(root, THIRD_PARTY_LICENSES)
    );
}

function deployExamples(root, bundle) {
    var examplesRoot = path.join(root, DEPLOY_EXAMPLES),
        stylesPath = "../../../styles/$2.min.css",
        scriptsPath = "../../../js/$2.min.js";

    if (bundle.hasSource) {
        stylesPath = "../../../source/styles/$2.css";
        scriptsPath = "../../../source/js/$2.js";
    }

    kendoBuild.mkdir(examplesRoot);
    copyDir(
        path.join(DEMOS_ROOT, SHARED_ROOT),
        path.join(examplesRoot, SHARED_ROOT)
    );

    bundle.suites.forEach(function(suite) {
        var suiteSrc = path.join(DEMOS_ROOT, suite),
            suiteDest = path.join(examplesRoot, suite);

        copyDir(suiteSrc, suiteDest);
        processFiles(suiteDest, /\.html$/, function(name) {
            var data = readText(name);

            data = data.replace(/(\.\.\/)+styles\/(.*?)\.css/g, stylesPath);
            data = data.replace(/(\.\.\/)+src\/(.*?)\.js/g, scriptsPath);
            data = data.replace(/min\.min/g, "min");

            // Add back button
            data = data.replace(/(<!-- description -->)/, '<a href="../index.html">Back</a>');

            // Remove marker comments
            data = data.replace(/\s*<!--\s*\w+\s*-->\s*$/gm, '');

            writeText(name, data);
        });

        buildSuiteIndex(suiteDest);
    });

    buildBundleIndex(root, bundle);
}

function buildSuiteIndex(suiteRoot) {
    var navigation = readText(
        path.join(suiteRoot, "js", EXAMPLES_NAVIGATION)
    );

    var indexTemplate = template(
        readText(SUITE_INDEX)
    );

    eval(navigation);
    delete categories.overview;

    writeText(
        path.join(suiteRoot, INDEX),
        indexTemplate(categories)
    );
}

function buildBundleIndex(root, bundle) {
    var indexTemplate = template(
        readText(BUNDLE_INDEX)
    );

    writeText(
        path.join(root, DEPLOY_EXAMPLES, INDEX),
        indexTemplate(bundle)
    );
}

function buildBundle(bundle, success) {
    var name = bundle.name,
        license = bundle.license,
        deployName = name + "." + VERSION + "." + license,
        root = path.join(DEPLOY_ROOT, name + "." + license),
        srcLicenseTemplate = readText(path.join(LEGAL_ROOT, SRC_LICENSE)),
        srcLicense = template(srcLicenseTemplate)({ version: VERSION, year: startDate.getFullYear() }),
        packageName = path.join(DROP_LOCATION, deployName + ".zip");

    console.log("Building " + deployName);
    mkdir(root);

    console.log("Deploying scripts");
    deployScripts(root, srcLicense, bundle.hasSource);

    console.log("Deploying styles");
    deployStyles(root, srcLicense, bundle.hasSource);

    console.log("Deploying licenses");
    deployLicenses(root, bundle);

    console.log("Deploying examples");
    deployExamples(root, bundle);

    zip(packageName, root, success);
}

function buildAllBundles(success, bundleIx) {
    bundleIx = bundleIx || 0;

    if (bundleIx < bundles.length) {
        buildBundle(bundles[bundleIx], function() {
            buildAllBundles(success, ++bundleIx);
        });
    } else {
        success();
    }
}

function buildOnlineExamples(success) {
    var onlinExamplesRoot = path.join(DEPLOY_ROOT, DEPLOY_ONLINEEXAMPLES),
        packageName = path.join(DROP_LOCATION, ONLINE_EXAMPLES_PACKAGE);

    kendoExamples.buildLive(onlinExamplesRoot);
    zip(packageName, onlinExamplesRoot, success);
}

console.log("Build starting at " + startDate);
initWorkspace();

console.log("Merging multi-part scripts");
kendoScripts.mergeScripts();

console.log("Building themes");
themes.build();

buildAllBundles(function() {
    console.log("Building online examples");
    buildOnlineExamples(function() {
        console.log("Time elapsed: " + ((new Date() - startDate) / 1000) + " seconds");
    });
});

