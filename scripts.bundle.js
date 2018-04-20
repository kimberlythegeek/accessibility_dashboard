// Licensed to the Software Freedom Conservancy (SFC) under one
// or more contributor license agreements.  See the NOTICE file
// distributed with this work for additional information
// regarding copyright ownership.  The SFC licenses this file
// to you under the Apache License, Version 2.0 (the
// "License"); you may not use this file except in compliance
// with the License.  You may obtain a copy of the License at
//
//   http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing,
// software distributed under the License is distributed on an
// "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
// KIND, either express or implied.  See the License for the
// specific language governing permissions and limitations
// under the License.

/**
 * @fileoverview Defines the {@linkplain Driver WebDriver} client for Firefox.
 * Before using this module, you must download the latest
 * [geckodriver release] and ensure it can be found on your system [PATH].
 *
 * Each FirefoxDriver instance will be created with an anonymous profile,
 * ensuring browser historys do not share session data (cookies, history, cache,
 * offline storage, etc.)
 *
 * __Customizing the Firefox Profile__
 *
 * The profile used for each WebDriver session may be configured using the
 * {@linkplain Options} class. For example, you may install an extension, like
 * Firebug:
 *
 *     const {Builder} = require('selenium-webdriver');
 *     const firefox = require('selenium-webdriver/firefox');
 *
 *     let options = new firefox.Options()
 *         .addExtensions('/path/to/firebug.xpi')
 *         .setPreference('extensions.firebug.showChromeErrors', true);
 *
 *     let driver = new Builder()
 *         .forBrowser('firefox')
 *         .setFirefoxOptions(options)
 *         .build();
 *
 * The {@linkplain Options} class may also be used to configure WebDriver based
 * on a pre-existing browser profile:
 *
 *     let profile = '/usr/local/home/bob/.mozilla/firefox/3fgog75h.testing';
 *     let options = new firefox.Options().setProfile(profile);
 *
 * The FirefoxDriver will _never_ modify a pre-existing profile; instead it will
 * create a copy for it to modify. By extension, there are certain browser
 * preferences that are required for WebDriver to function properly and they
 * will always be overwritten.
 *
 * __Using a Custom Firefox Binary__
 *
 * On Windows and MacOS, the FirefoxDriver will search for Firefox in its
 * default installation location:
 *
 * - Windows: C:\Program Files and C:\Program Files (x86).
 * - MacOS: /Applications/Firefox.app
 *
 * For Linux, Firefox will always be located on the PATH: `$(where firefox)`.
 *
 * Several methods are provided for starting Firefox with a custom executable.
 * First, on Windows and MacOS, you may configure WebDriver to check the default
 * install location for a non-release channel. If the requested channel cannot
 * be found in its default location, WebDriver will fallback to searching your
 * PATH. _Note:_ on Linux, Firefox is _always_ located on your path, regardless
 * of the requested channel.
 *
 *     const {Builder} = require('selenium-webdriver');
 *     const firefox = require('selenium-webdriver/firefox');
 *
 *     let options = new firefox.Options().setBinary(firefox.Channel.NIGHTLY);
 *     let driver = new Builder()
 *         .forBrowser('firefox')
 *         .setFirefoxOptions(options)
 *         .build();
 *
 * On all platforms, you may configrue WebDriver to use a Firefox specific
 * executable:
 *
 *     let options = new firefox.Options()
 *         .setBinary('/my/firefox/install/dir/firefox-bin');
 *
 * __Remote Testing__
 *
 * You may customize the Firefox binary and profile when running against a
 * remote Selenium server. Your custom profile will be packaged as a zip and
 * transfered to the remote host for use. The profile will be transferred
 * _once for each new session_. The performance impact should be minimal if
 * you've only configured a few extra browser preferences. If you have a large
 * profile with several extensions, you should consider installing it on the
 * remote host and defining its path via the {@link Options} class. Custom
 * binaries are never copied to remote machines and must be referenced by
 * installation path.
 *
 *     const {Builder} = require('selenium-webdriver');
 *     const firefox = require('selenium-webdriver/firefox');
 *
 *     let options = new firefox.Options()
 *         .setProfile('/profile/path/on/remote/host')
 *         .setBinary('/install/dir/on/remote/host/firefox-bin');
 *
 *     let driver = new Builder()
 *         .forBrowser('firefox')
 *         .usingServer('http://127.0.0.1:4444/wd/hub')
 *         .setFirefoxOptions(options)
 *         .build();
 *
 * [geckodriver release]: https://github.com/mozilla/geckodriver/releases/
 * [PATH]: http://en.wikipedia.org/wiki/PATH_%28variable%29
 */

'use strict';

const path = require('path');
const url = require('url');

const Symbols = require('./lib/symbols');
const command = require('./lib/command');
const exec = require('./io/exec');
const http = require('./http');
const httpUtil = require('./http/util');
const io = require('./io');
const net = require('./net');
const portprober = require('./net/portprober');
const remote = require('./remote');
const webdriver = require('./lib/webdriver');
const zip = require('./io/zip');
const {Browser, Capabilities} = require('./lib/capabilities');
const {Zip} = require('./io/zip');


/**
 * Thrown when there an add-on is malformed.
 * @final
 */
class AddonFormatError extends Error {
  /** @param {string} msg The error message. */
  constructor(msg) {
    super(msg);
    /** @override */
    this.name = this.constructor.name;
  }
}


/**
 * Installs an extension to the given directory.
 * @param {string} extension Path to the xpi extension file to install.
 * @param {string} dir Path to the directory to install the extension in.
 * @return {!Promise<string>} A promise for the add-on ID once
 *     installed.
 */
async function installExtension(extension, dir) {
  if (extension.slice(-4) !== '.xpi') {
    throw Error('Path ath is not a xpi file: ' + extension);
  }

  let archive = await zip.load(extension);
  if (!archive.has('manifest.json')) {
    throw new AddonFormatError(`Couldn't find manifest.json in ${extension}`);
  }

  let buf = await archive.getFile('manifest.json');
  let {applications} =
      /** @type {{applications:{gecko:{id:string}}}} */(
          JSON.parse(buf.toString('utf8')));
  if (!(applications && applications.gecko && applications.gecko.id)) {
    throw new AddonFormatError(`Could not find add-on ID for ${extension}`);
  }

  await io.copy(extension, `${path.join(dir, applications.gecko.id)}.xpi`);
  return applications.gecko.id;
}


class Profile {
  constructor() {
    /** @private {?string} */
    this.template_ = null;

    /** @private {!Array<string>} */
    this.extensions_ = [];
  }

  addExtensions(/** !Array<string> */paths) {
    this.extensions_ = this.extensions_.concat(...paths);
  }

  /**
   * @return {(!Promise<string>|undefined)} a promise for a base64 encoded
   *     profile, or undefined if there's no data to include.
   */
  [Symbols.serialize]() {
    if (this.template_ || this.extensions_.length) {
      return buildProfile(this.template_, this.extensions_);
    }
    return undefined;
  }
}


/**
 * @param {?string} template path to an existing profile to use as a template.
 * @param {!Array<string>} extensions paths to extensions to install in the new
 *     profile.
 * @return {!Promise<string>} a promise for the base64 encoded profile.
 */
async function buildProfile(template, extensions) {
  let dir = template;

  if (extensions.length) {
    dir = await io.tmpDir();
    if (template) {
      await io.copyDir(
          /** @type {string} */(template),
          dir, /(parent\.lock|lock|\.parentlock)/);
    }

    const extensionsDir = path.join(dir, 'extensions');
    await io.mkdir(extensionsDir);

    for (let i = 0; i < extensions.length; i++) {
      await installExtension(extensions[i], extensionsDir);
    }
  }

  let zip = new Zip;
  return zip.addDir(dir)
      .then(() => zip.toBuffer())
      .then(buf => buf.toString('base64'));
}


/**
 * Configuration options for the FirefoxDriver.
 */
class Options extends Capabilities {
  /**
   * @param {(Capabilities|Map<string, ?>|Object)=} other Another set of
   *     capabilities to initialize this instance from.
   */
  constructor(other) {
    super(other);
    this.setBrowserName(Browser.FIREFOX);
  }

  /**
   * @return {!Object}
   * @private
   */
  firefoxOptions_() {
    let options = this.get('moz:firefoxOptions');
    if (!options) {
      options = {};
      this.set('moz:firefoxOptions', options);
    }
    return options;
  }

  /**
   * @return {!Profile}
   * @private
   */
  profile_() {
    let options = this.firefoxOptions_();
    if (!options.profile) {
      options.profile = new Profile();
    }
    return options.profile;
  }

  /**
   * Specify additional command line arguments that should be used when starting
   * the Firefox browser.
   *
   * @param {...(string|!Array<string>)} args The arguments to include.
   * @return {!Options} A self reference.
   */
  addArguments(...args) {
    if (args.length) {
      let options = this.firefoxOptions_();
      options.args = options.args ? options.args.concat(...args) : args;
    }
    return this;
  }

  /**
   * Configures the geckodriver to start Firefox in headless mode.
   *
   * @return {!Options} A self reference.
   */
  headless() {
    return this.addArguments('-headless');
  }

  /**
   * Sets the initial window size when running in
   * {@linkplain #headless headless} mode.
   *
   * @param {{width: number, height: number}} size The desired window size.
   * @return {!Options} A self reference.
   * @throws {TypeError} if width or height is unspecified, not a number, or
   *     less than or equal to 0.
   */
  windowSize({width, height}) {
    function checkArg(arg) {
      if (typeof arg !== 'number' || arg <= 0) {
        throw TypeError('Arguments must be {width, height} with numbers > 0');
      }
    }
    checkArg(width);
    checkArg(height);
    return this.addArguments(`--window-size=${width},${height}`);
  }

  /**
   * Add extensions that should be installed when starting Firefox.
   *
   * @param {...string} paths The paths to the extension XPI files to install.
   * @return {!Options} A self reference.
   */
  addExtensions(...paths) {
    this.profile_().addExtensions(paths);
    return this;
  }

  /**
   * @param {string} key the preference key.
   * @param {(string|number|boolean)} value the preference value.
   * @return {!Options} A self reference.
   * @throws {TypeError} if either the key or value has an invalid type.
   */
  setPreference(key, value) {
    if (typeof key !== 'string') {
      throw TypeError(`key must be a string, but got ${typeof key}`);
    }
    if (typeof value !== 'string'
        && typeof value !== 'number'
        && typeof value !== 'boolean') {
      throw TypeError(
          `value must be a string, number, or boolean, but got ${typeof value}`);
    }
    let options = this.firefoxOptions_();
    options.prefs = options.prefs || {};
    options.prefs[key] = value;
    return this;
  }

  /**
   * Sets the path to an existing profile to use as a template for new browser
   * sessions. This profile will be copied for each new session - changes will
   * not be applied to the profile itself.
   *
   * @param {string} profile The profile to use.
   * @return {!Options} A self reference.
   * @throws {TypeError} if profile is not a string.
   */
  setProfile(profile) {
    if (typeof profile !== 'string') {
      throw TypeError(`profile must be a string, but got ${typeof profile}`);
    }
    this.profile_().template_ = profile;
    return this;
  }

  /**
   * Sets the binary to use. The binary may be specified as the path to a
   * Firefox executable or a desired release {@link Channel}.
   *
   * @param {(string|!Channel)} binary The binary to use.
   * @return {!Options} A self reference.
   * @throws {TypeError} If `binary` is an invalid type.
   */
  setBinary(binary) {
    if (binary instanceof Channel || typeof binary === 'string') {
      this.firefoxOptions_().binary = binary;
      return this;
    }
    throw TypeError('binary must be a string path or Channel object');
  }
}


/**
 * Enum of available command contexts.
 *
 * Command contexts are specific to Marionette, and may be used with the
 * {@link #context=} method. Contexts allow you to direct all subsequent
 * commands to either "content" (default) or "chrome". The latter gives
 * you elevated security permissions.
 *
 * @enum {string}
 */
const Context = {
  CONTENT: "content",
  CHROME: "chrome",
};


const GECKO_DRIVER_EXE =
    process.platform === 'win32' ? 'geckodriver.exe' : 'geckodriver';


/**
 * _Synchronously_ attempts to locate the geckodriver executable on the current
 * system.
 *
 * @return {?string} the located executable, or `null`.
 */
function locateSynchronously() {
  return io.findInPath(GECKO_DRIVER_EXE, true);
}


/**
 * @return {string} .
 * @throws {Error}
 */
function findGeckoDriver() {
  let exe = locateSynchronously();
  if (!exe) {
    throw Error(
      'The ' + GECKO_DRIVER_EXE + ' executable could not be found on the current ' +
      'PATH. Please download the latest version from ' +
      'https://github.com/mozilla/geckodriver/releases/ ' +
      'and ensure it can be found on your PATH.');
  }
  return exe;
}


/**
 * @param {string} file Path to the file to find, relative to the program files
 *     root.
 * @return {!Promise<?string>} A promise for the located executable.
 *     The promise will resolve to {@code null} if Firefox was not found.
 */
function findInProgramFiles(file) {
  let files = [
    process.env['PROGRAMFILES'] || 'C:\\Program Files',
    process.env['PROGRAMFILES(X86)'] || 'C:\\Program Files (x86)'
  ].map(prefix => path.join(prefix, file));
  return io.exists(files[0]).then(function(exists) {
    return exists ? files[0] : io.exists(files[1]).then(function(exists) {
      return exists ? files[1] : null;
    });
  });
}


/** @enum {string} */
const ExtensionCommand = {
  GET_CONTEXT: 'getContext',
  SET_CONTEXT: 'setContext',
  INSTALL_ADDON: 'install addon',
  UNINSTALL_ADDON: 'uninstall addon',
};


/**
 * Creates a command executor with support for Marionette's custom commands.
 * @param {!Promise<string>} serverUrl The server's URL.
 * @return {!command.Executor} The new command executor.
 */
function createExecutor(serverUrl) {
  let client = serverUrl.then(url => new http.HttpClient(url));
  let executor = new http.Executor(client);
  configureExecutor(executor);
  return executor;
}


/**
 * Configures the given executor with Firefox-specific commands.
 * @param {!http.Executor} executor the executor to configure.
 */
function configureExecutor(executor) {
  executor.defineCommand(
      ExtensionCommand.GET_CONTEXT,
      'GET',
      '/session/:sessionId/moz/context');

  executor.defineCommand(
      ExtensionCommand.SET_CONTEXT,
      'POST',
      '/session/:sessionId/moz/context');

  executor.defineCommand(
      ExtensionCommand.INSTALL_ADDON,
      'POST',
      '/session/:sessionId/moz/addon/install');

  executor.defineCommand(
      ExtensionCommand.UNINSTALL_ADDON,
      'POST',
      '/session/:sessionId/moz/addon/uninstall');
}


/**
 * Creates {@link selenium-webdriver/remote.DriverService} instances that manage
 * a [geckodriver](https://github.com/mozilla/geckodriver) server in a child
 * process.
 */
class ServiceBuilder extends remote.DriverService.Builder {
  /**
   * @param {string=} opt_exe Path to the server executable to use. If omitted,
   *     the builder will attempt to locate the geckodriver on the system PATH.
   */
  constructor(opt_exe) {
    super(opt_exe || findGeckoDriver());
    this.setLoopback(true);  // Required.
  }

  /**
   * Enables verbose logging.
   *
   * @param {boolean=} opt_trace Whether to enable trace-level logging. By
   *     default, only debug logging is enabled.
   * @return {!ServiceBuilder} A self reference.
   */
  enableVerboseLogging(opt_trace) {
    return this.addArguments(opt_trace ? '-vv' : '-v');
  }
}


/**
 * A WebDriver client for Firefox.
 */
class Driver extends webdriver.WebDriver {
  /**
   * Creates a new Firefox session.
   *
   * @param {(Options|Capabilities|Object)=} opt_config The
   *    configuration options for this driver, specified as either an
   *    {@link Options} or {@link Capabilities}, or as a raw hash object.
   * @param {(http.Executor|remote.DriverService)=} opt_executor Either a
   *   pre-configured command executor to use for communicating with an
   *   externally managed remote end (which is assumed to already be running),
   *   or the `DriverService` to use to start the geckodriver in a child
   *   process.
   *
   *   If an executor is provided, care should e taken not to use reuse it with
   *   other clients as its internal command mappings will be updated to support
   *   Firefox-specific commands.
   *
   *   _This parameter may only be used with Mozilla's GeckoDriver._
   *
   * @throws {Error} If a custom command executor is provided and the driver is
   *     configured to use the legacy FirefoxDriver from the Selenium project.
   * @return {!Driver} A new driver instance.
   */
  static createSession(opt_config, opt_executor) {
    let caps =
        opt_config instanceof Capabilities
            ? opt_config : new Options(opt_config);

    let executor;
    let onQuit;

    if (opt_executor instanceof http.Executor) {
      executor = opt_executor;
      configureExecutor(executor);
    } else if (opt_executor instanceof remote.DriverService) {
      executor = createExecutor(opt_executor.start());
      onQuit = () => opt_executor.kill();
    } else {
      let service = new ServiceBuilder().build();
      executor = createExecutor(service.start());
      onQuit = () => service.kill();
    }

    return /** @type {!Driver} */(super.createSession(executor, caps, onQuit));
  }

  /**
   * This function is a no-op as file detectors are not supported by this
   * implementation.
   * @override
   */
  setFileDetector() {
  }

  /**
   * Get the context that is currently in effect.
   *
   * @return {!Promise<Context>} Current context.
   */
  getContext() {
    return this.execute(new command.Command(ExtensionCommand.GET_CONTEXT));
  }

  /**
   * Changes target context for commands between chrome- and content.
   *
   * Changing the current context has a stateful impact on all subsequent
   * commands. The {@link Context.CONTENT} context has normal web
   * platform document permissions, as if you would evaluate arbitrary
   * JavaScript. The {@link Context.CHROME} context gets elevated
   * permissions that lets you manipulate the browser chrome itself,
   * with full access to the XUL toolkit.
   *
   * Use your powers wisely.
   *
   * @param {!Promise<void>} ctx The context to switch to.
   */
  setContext(ctx) {
    return this.execute(
        new command.Command(ExtensionCommand.SET_CONTEXT)
            .setParameter("context", ctx));
  }

  /**
   * Installs a new addon with the current session. This function will return an
   * ID that may later be used to {@linkplain #uninstallAddon uninstall} the
   * addon.
   *
   *
   * @param {string} path Path on the local filesystem to the web extension to
   *     install.
   * @return {!Promise<string>} A promise that will resolve to an ID for the
   *     newly installed addon.
   * @see #uninstallAddon
   */
  async installAddon(path) {
    let buf = await io.read(path);
    return this.execute(
        new command.Command(ExtensionCommand.INSTALL_ADDON)
            .setParameter('addon', buf.toString('base64')));
  }

  /**
   * Uninstalls an addon from the current browser session's profile.
   *
   * @param {(string|!Promise<string>)} id ID of the addon to uninstall.
   * @return {!Promise} A promise that will resolve when the operation has
   *     completed.
   * @see #installAddon
   */
  async uninstallAddon(id) {
    id = await Promise.resolve(id);
    return this.execute(
        new command.Command(ExtensionCommand.UNINSTALL_ADDON)
            .setParameter('id', id));
  }
}


/**
 * Provides methods for locating the executable for a Firefox release channel
 * on Windows and MacOS. For other systems (i.e. Linux), Firefox will always
 * be located on the system PATH.
 *
 * @final
 */
class Channel {
  /**
   * @param {string} darwin The path to check when running on MacOS.
   * @param {string} win32 The path to check when running on Windows.
   */
  constructor(darwin, win32) {
    /** @private @const */ this.darwin_ = darwin;
    /** @private @const */ this.win32_ = win32;
    /** @private {Promise<string>} */
    this.found_ = null;
  }

  /**
   * Attempts to locate the Firefox executable for this release channel. This
   * will first check the default installation location for the channel before
   * checking the user's PATH. The returned promise will be rejected if Firefox
   * can not be found.
   *
   * @return {!Promise<string>} A promise for the location of the located
   *     Firefox executable.
   */
  locate() {
    if (this.found_) {
      return this.found_;
    }

    let found;
    switch (process.platform) {
      case 'darwin':
        found = io.exists(this.darwin_)
            .then(exists => exists ? this.darwin_ : io.findInPath('firefox'));
        break;

      case 'win32':
        found = findInProgramFiles(this.win32_)
            .then(found => found || io.findInPath('firefox.exe'));
        break;

      default:
        found = Promise.resolve(io.findInPath('firefox'));
        break;
    }

    this.found_ = found.then(found => {
      if (found) {
        // TODO: verify version info.
        return found;
      }
      throw Error('Could not locate Firefox on the current system');
    });
    return this.found_;
  }

  /** @return {!Promise<string>} */
  [Symbols.serialize]() {
    return this.locate();
  }
}


/**
 * Firefox's developer channel.
 * @const
 * @see <https://www.mozilla.org/en-US/firefox/channel/desktop/#aurora>
 */
Channel.AURORA = new Channel(
  '/Applications/FirefoxDeveloperEdition.app/Contents/MacOS/firefox-bin',
  'Firefox Developer Edition\\firefox.exe');

/**
 * Firefox's beta channel. Note this is provided mainly for convenience as
 * the beta channel has the same installation location as the main release
 * channel.
 * @const
 * @see <https://www.mozilla.org/en-US/firefox/channel/desktop/#beta>
 */
Channel.BETA = new Channel(
  '/Applications/Firefox.app/Contents/MacOS/firefox-bin',
  'Mozilla Firefox\\firefox.exe');

/**
 * Firefox's release channel.
 * @const
 * @see <https://www.mozilla.org/en-US/firefox/desktop/>
 */
Channel.RELEASE = new Channel(
  '/Applications/Firefox.app/Contents/MacOS/firefox-bin',
  'Mozilla Firefox\\firefox.exe');

/**
 * Firefox's nightly release channel.
 * @const
 * @see <https://www.mozilla.org/en-US/firefox/channel/desktop/#nightly>
 */
Channel.NIGHTLY = new Channel(
  '/Applications/Firefox Nightly.app/Contents/MacOS/firefox-bin',
  'Nightly\\firefox.exe');


// PUBLIC API


exports.Channel = Channel;
exports.Context = Context;
exports.Driver = Driver;
exports.Options = Options;
exports.ServiceBuilder = ServiceBuilder;
exports.locateSynchronously = locateSynchronously;

;// Licensed to the Software Freedom Conservancy (SFC) under one
// or more contributor license agreements.  See the NOTICE file
// distributed with this work for additional information
// regarding copyright ownership.  The SFC licenses this file
// to you under the Apache License, Version 2.0 (the
// "License"); you may not use this file except in compliance
// with the License.  You may obtain a copy of the License at
//
//   http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing,
// software distributed under the License is distributed on an
// "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
// KIND, either express or implied.  See the License for the
// specific language governing permissions and limitations
// under the License.

/**
 * @fileoverview The main user facing module. Exports WebDriver's primary
 * public API and provides convenience assessors to certain sub-modules.
 */

'use strict';

const _http = require('./http');
const by = require('./lib/by');
const capabilities = require('./lib/capabilities');
const chrome = require('./chrome');
const command = require('./lib/command');
const edge = require('./edge');
const error = require('./lib/error');
const firefox = require('./firefox');
const ie = require('./ie');
const input = require('./lib/input');
const logging = require('./lib/logging');
const promise = require('./lib/promise');
const remote = require('./remote');
const safari = require('./safari');
const session = require('./lib/session');
const until = require('./lib/until');
const webdriver = require('./lib/webdriver');

const Browser = capabilities.Browser;
const Capabilities = capabilities.Capabilities;
const Capability = capabilities.Capability;
const Session = session.Session;
const WebDriver = webdriver.WebDriver;



var seleniumServer;

/**
 * Starts an instance of the Selenium server if not yet running.
 * @param {string} jar Path to the server jar to use.
 * @return {!Promise<string>} A promise for the server's
 *     address once started.
 */
function startSeleniumServer(jar) {
  if (!seleniumServer) {
    seleniumServer = new remote.SeleniumServer(jar);
  }
  return seleniumServer.start();
}


/**
 * {@linkplain webdriver.WebDriver#setFileDetector WebDriver's setFileDetector}
 * method uses a non-standard command to transfer files from the local client
 * to the remote end hosting the browser. Many of the WebDriver sub-types, like
 * the {@link chrome.Driver} and {@link firefox.Driver}, do not support this
 * command. Thus, these classes override the `setFileDetector` to no-op.
 *
 * This function uses a mixin to re-enable `setFileDetector` by calling the
 * original method on the WebDriver prototype directly. This is used only when
 * the builder creates a Chrome or Firefox instance that communicates with a
 * remote end (and thus, support for remote file detectors is unknown).
 *
 * @param {function(new: webdriver.WebDriver, ...?)} ctor
 * @return {function(new: webdriver.WebDriver, ...?)}
 */
function ensureFileDetectorsAreEnabled(ctor) {
  const mixin = class extends ctor {
    /** @param {input.FileDetector} detector */
    setFileDetector(detector) {
      webdriver.WebDriver.prototype.setFileDetector.call(this, detector);
    }
  };
  return mixin;
}


/**
 * A thenable wrapper around a {@linkplain webdriver.IWebDriver IWebDriver}
 * instance that allows commands to be issued directly instead of having to
 * repeatedly call `then`:
 *
 *     let driver = new Builder().build();
 *     driver.then(d => d.get(url));  // You can do this...
 *     driver.get(url);               // ...or this
 *
 * If the driver instance fails to resolve (e.g. the session cannot be created),
 * every issued command will fail.
 *
 * @extends {webdriver.IWebDriver}
 * @extends {IThenable<!webdriver.IWebDriver>}
 * @interface
 */
class ThenableWebDriver {
  /** @param {...?} args */
  static createSession(...args) {}
}


/**
 * @const {!Map<function(new: WebDriver, !IThenable<!Session>, ...?),
 *              function(new: ThenableWebDriver, !IThenable<!Session>, ...?)>}
 */
const THENABLE_DRIVERS = new Map;


/**
 * @param {function(new: WebDriver, !IThenable<!Session>, ...?)} ctor
 * @param {...?} args
 * @return {!ThenableWebDriver}
 */
function createDriver(ctor, ...args) {
  let thenableWebDriverProxy = THENABLE_DRIVERS.get(ctor);
  if (!thenableWebDriverProxy) {
    /**
     * @extends {WebDriver}  // Needed since `ctor` is dynamically typed.
     * @implements {ThenableWebDriver}
     */
    thenableWebDriverProxy = class extends ctor {
      /**
       * @param {!IThenable<!Session>} session
       * @param {...?} rest
       */
      constructor(session, ...rest) {
        super(session, ...rest);

        const pd = this.getSession().then(session => {
          return new ctor(session, ...rest);
        });

        /** @override */
        this.then = pd.then.bind(pd);

        /** @override */
        this.catch = pd.catch.bind(pd);
      }
    };
    THENABLE_DRIVERS.set(ctor, thenableWebDriverProxy);
  }
  return thenableWebDriverProxy.createSession(...args);
}


/**
 * Creates new {@link webdriver.WebDriver WebDriver} instances. The environment
 * variables listed below may be used to override a builder's configuration,
 * allowing quick runtime changes.
 *
 * - {@code SELENIUM_BROWSER}: defines the target browser in the form
 *   {@code browser[:version][:platform]}.
 *
 * - {@code SELENIUM_REMOTE_URL}: defines the remote URL for all builder
 *   instances. This environment variable should be set to a fully qualified
 *   URL for a WebDriver server (e.g. http://localhost:4444/wd/hub). This
 *   option always takes precedence over {@code SELENIUM_SERVER_JAR}.
 *
 * - {@code SELENIUM_SERVER_JAR}: defines the path to the
 *   <a href="http://selenium-release.storage.googleapis.com/index.html">
 *   standalone Selenium server</a> jar to use. The server will be started the
 *   first time a WebDriver instance and be killed when the process exits.
 *
 * Suppose you had mytest.js that created WebDriver with
 *
 *     var driver = new webdriver.Builder()
 *         .forBrowser('chrome')
 *         .build();
 *
 * This test could be made to use Firefox on the local machine by running with
 * `SELENIUM_BROWSER=firefox node mytest.js`. Rather than change the code to
 * target Google Chrome on a remote machine, you can simply set the
 * `SELENIUM_BROWSER` and `SELENIUM_REMOTE_URL` environment variables:
 *
 *     SELENIUM_BROWSER=chrome:36:LINUX \
 *     SELENIUM_REMOTE_URL=http://www.example.com:4444/wd/hub \
 *     node mytest.js
 *
 * You could also use a local copy of the standalone Selenium server:
 *
 *     SELENIUM_BROWSER=chrome:36:LINUX \
 *     SELENIUM_SERVER_JAR=/path/to/selenium-server-standalone.jar \
 *     node mytest.js
 */
class Builder {
  constructor() {
    /** @private @const */
    this.log_ = logging.getLogger('webdriver.Builder');

    /** @private {string} */
    this.url_ = '';

    /** @private {?string} */
    this.proxy_ = null;

    /** @private {!Capabilities} */
    this.capabilities_ = new Capabilities();

    /** @private {chrome.Options} */
    this.chromeOptions_ = null;

    /** @private {chrome.ServiceBuilder} */
    this.chromeService_ = null;

    /** @private {firefox.Options} */
    this.firefoxOptions_ = null;

    /** @private {firefox.ServiceBuilder} */
    this.firefoxService_ = null;

    /** @private {ie.Options} */
    this.ieOptions_ = null;

    /** @private {safari.Options} */
    this.safariOptions_ = null;

    /** @private {edge.Options} */
    this.edgeOptions_ = null;

    /** @private {remote.DriverService.Builder} */
    this.edgeService_ = null;

    /** @private {boolean} */
    this.ignoreEnv_ = false;

    /** @private {http.Agent} */
    this.agent_ = null;
  }

  /**
   * Configures this builder to ignore any environment variable overrides and to
   * only use the configuration specified through this instance's API.
   *
   * @return {!Builder} A self reference.
   */
  disableEnvironmentOverrides() {
    this.ignoreEnv_ = true;
    return this;
  }

  /**
   * Sets the URL of a remote WebDriver server to use. Once a remote URL has
   * been specified, the builder direct all new clients to that server. If this
   * method is never called, the Builder will attempt to create all clients
   * locally.
   *
   * As an alternative to this method, you may also set the
   * `SELENIUM_REMOTE_URL` environment variable.
   *
   * @param {string} url The URL of a remote server to use.
   * @return {!Builder} A self reference.
   */
  usingServer(url) {
    this.url_ = url;
    return this;
  }

  /**
   * @return {string} The URL of the WebDriver server this instance is
   *     configured to use.
   */
  getServerUrl() {
    return this.url_;
  }

  /**
   * Sets the URL of the proxy to use for the WebDriver's HTTP connections.
   * If this method is never called, the Builder will create a connection
   * without a proxy.
   *
   * @param {string} proxy The URL of a proxy to use.
   * @return {!Builder} A self reference.
   */
  usingWebDriverProxy(proxy) {
    this.proxy_ = proxy;
    return this;
  }

  /**
   * @return {?string} The URL of the proxy server to use for the WebDriver's
   *    HTTP connections, or `null` if not set.
   */
  getWebDriverProxy() {
    return this.proxy_;
  }

  /**
   * Sets the http agent to use for each request.
   * If this method is not called, the Builder will use http.globalAgent by default.
   *
   * @param {http.Agent} agent The agent to use for each request.
   * @return {!Builder} A self reference.
   */
  usingHttpAgent(agent) {
    this.agent_ = agent;
    return this;
  }

  /**
   * @return {http.Agent} The http agent used for each request
   */
  getHttpAgent() {
    return this.agent_;
  }

  /**
   * Sets the desired capabilities when requesting a new session. This will
   * overwrite any previously set capabilities.
   * @param {!(Object|Capabilities)} capabilities The desired capabilities for
   *     a new session.
   * @return {!Builder} A self reference.
   */
  withCapabilities(capabilities) {
    this.capabilities_ = new Capabilities(capabilities);
    return this;
  }

  /**
   * Returns the base set of capabilities this instance is currently configured
   * to use.
   * @return {!Capabilities} The current capabilities for this builder.
   */
  getCapabilities() {
    return this.capabilities_;
  }

  /**
   * Configures the target browser for clients created by this instance.
   * Any calls to {@link #withCapabilities} after this function will
   * overwrite these settings.
   *
   * You may also define the target browser using the {@code SELENIUM_BROWSER}
   * environment variable. If set, this environment variable should be of the
   * form `browser[:[version][:platform]]`.
   *
   * @param {(string|!Browser)} name The name of the target browser;
   *     common defaults are available on the {@link webdriver.Browser} enum.
   * @param {string=} opt_version A desired version; may be omitted if any
   *     version should be used.
   * @param {(string|!capabilities.Platform)=} opt_platform
   *     The desired platform; may be omitted if any platform may be used.
   * @return {!Builder} A self reference.
   */
  forBrowser(name, opt_version, opt_platform) {
    this.capabilities_.setBrowserName(name);
    if (opt_version) {
      this.capabilities_.setBrowserVersion(opt_version);
    }
    if (opt_platform) {
      this.capabilities_.setPlatform(opt_platform);
    }
    return this;
  }

  /**
   * Sets the proxy configuration for the target browser.
   * Any calls to {@link #withCapabilities} after this function will
   * overwrite these settings.
   *
   * @param {!./lib/proxy.Config} config The configuration to use.
   * @return {!Builder} A self reference.
   */
  setProxy(config) {
    this.capabilities_.setProxy(config);
    return this;
  }

  /**
   * Sets the logging preferences for the created session. Preferences may be
   * changed by repeated calls, or by calling {@link #withCapabilities}.
   * @param {!(./lib/logging.Preferences|Object<string, string>)} prefs The
   *     desired logging preferences.
   * @return {!Builder} A self reference.
   */
  setLoggingPrefs(prefs) {
    this.capabilities_.setLoggingPrefs(prefs);
    return this;
  }

  /**
   * Sets the default action to take with an unexpected alert before returning
   * an error.
   *
   * @param {?capabilities.UserPromptHandler} behavior The desired behavior.
   * @return {!Builder} A self reference.
   * @see capabilities.Capabilities#setAlertBehavior
   */
  setAlertBehavior(behavior) {
    this.capabilities_.setAlertBehavior(behavior);
    return this;
  }

  /**
   * Sets Chrome specific {@linkplain chrome.Options options} for drivers
   * created by this builder. Any logging or proxy settings defined on the given
   * options will take precedence over those set through
   * {@link #setLoggingPrefs} and {@link #setProxy}, respectively.
   *
   * @param {!chrome.Options} options The ChromeDriver options to use.
   * @return {!Builder} A self reference.
   */
  setChromeOptions(options) {
    this.chromeOptions_ = options;
    return this;
  }

  /**
   * @return {chrome.Options} the Chrome specific options currently configured
   *     for this builder.
   */
  getChromeOptions() {
    return this.chromeOptions_;
  }

  /**
   * Sets the service builder to use for managing the chromedriver child process
   * when creating new Chrome sessions.
   *
   * @param {chrome.ServiceBuilder} service the service to use.
   * @return {!Builder} A self reference.
   */
  setChromeService(service) {
    if (service && !(service instanceof chrome.ServiceBuilder)) {
      throw TypeError('not a chrome.ServiceBuilder object');
    }
    this.chromeService_ = service;
    return this;
  }

  /**
   * Sets Firefox specific {@linkplain firefox.Options options} for drivers
   * created by this builder. Any logging or proxy settings defined on the given
   * options will take precedence over those set through
   * {@link #setLoggingPrefs} and {@link #setProxy}, respectively.
   *
   * @param {!firefox.Options} options The FirefoxDriver options to use.
   * @return {!Builder} A self reference.
   */
  setFirefoxOptions(options) {
    this.firefoxOptions_ = options;
    return this;
  }

  /**
   * @return {firefox.Options} the Firefox specific options currently configured
   *     for this instance.
   */
  getFirefoxOptions() {
    return this.firefoxOptions_;
  }

  /**
   * Sets the {@link firefox.ServiceBuilder} to use to manage the geckodriver
   * child process when creating Firefox sessions locally.
   *
   * @param {firefox.ServiceBuilder} service the service to use.
   * @return {!Builder} a self reference.
   */
  setFirefoxService(service) {
    if (service && !(service instanceof firefox.ServiceBuilder)) {
      throw TypeError('not a firefox.ServiceBuilder object');
    }
    this.firefoxService_ = service;
    return this;
  }

  /**
   * Set Internet Explorer specific {@linkplain ie.Options options} for drivers
   * created by this builder. Any proxy settings defined on the given options
   * will take precedence over those set through {@link #setProxy}.
   *
   * @param {!ie.Options} options The IEDriver options to use.
   * @return {!Builder} A self reference.
   */
  setIeOptions(options) {
    this.ieOptions_ = options;
    return this;
  }

  /**
   * Set {@linkplain edge.Options options} specific to Microsoft's Edge browser
   * for drivers created by this builder. Any proxy settings defined on the
   * given options will take precedence over those set through
   * {@link #setProxy}.
   *
   * @param {!edge.Options} options The MicrosoftEdgeDriver options to use.
   * @return {!Builder} A self reference.
   */
  setEdgeOptions(options) {
    this.edgeOptions_ = options;
    return this;
  }

  /**
   * Sets the {@link edge.ServiceBuilder} to use to manage the
   * MicrosoftEdgeDriver child process when creating sessions locally.
   *
   * @param {edge.ServiceBuilder} service the service to use.
   * @return {!Builder} a self reference.
   */
  setEdgeService(service) {
    if (service && !(service instanceof edge.ServiceBuilder)) {
      throw TypeError('not a edge.ServiceBuilder object');
    }
    this.edgeService_ = service;
    return this;
  }

  /**
   * Sets Safari specific {@linkplain safari.Options options} for drivers
   * created by this builder. Any logging settings defined on the given options
   * will take precedence over those set through {@link #setLoggingPrefs}.
   *
   * @param {!safari.Options} options The Safari options to use.
   * @return {!Builder} A self reference.
   */
  setSafariOptions(options) {
    this.safariOptions_ = options;
    return this;
  }

  /**
   * @return {safari.Options} the Safari specific options currently configured
   *     for this instance.
   */
  getSafariOptions() {
    return this.safariOptions_;
  }

  /**
   * Creates a new WebDriver client based on this builder's current
   * configuration.
   *
   * This method will return a {@linkplain ThenableWebDriver} instance, allowing
   * users to issue commands directly without calling `then()`. The returned
   * thenable wraps a promise that will resolve to a concrete
   * {@linkplain webdriver.WebDriver WebDriver} instance. The promise will be
   * rejected if the remote end fails to create a new session.
   *
   * @return {!ThenableWebDriver} A new WebDriver instance.
   * @throws {Error} If the current configuration is invalid.
   */
  build() {
    // Create a copy for any changes we may need to make based on the current
    // environment.
    var capabilities = new Capabilities(this.capabilities_);

    var browser;
    if (!this.ignoreEnv_ && process.env.SELENIUM_BROWSER) {
      this.log_.fine(`SELENIUM_BROWSER=${process.env.SELENIUM_BROWSER}`);
      browser = process.env.SELENIUM_BROWSER.split(/:/, 3);
      capabilities.setBrowserName(browser[0]);

      browser[1] && capabilities.setBrowserVersion(browser[1]);
      browser[2] && capabilities.setPlatform(browser[2]);
    }

    browser = capabilities.get(Capability.BROWSER_NAME);

    if (typeof browser !== 'string') {
      throw TypeError(
          `Target browser must be a string, but is <${typeof browser}>;` +
          ' did you forget to call forBrowser()?');
    }

    if (browser === 'ie') {
      browser = Browser.INTERNET_EXPLORER;
    }

    // Apply browser specific overrides.
    if (browser === Browser.CHROME && this.chromeOptions_) {
      capabilities.merge(this.chromeOptions_);

    } else if (browser === Browser.FIREFOX && this.firefoxOptions_) {
      capabilities.merge(this.firefoxOptions_);

    } else if (browser === Browser.INTERNET_EXPLORER && this.ieOptions_) {
      capabilities.merge(this.ieOptions_);

    } else if (browser === Browser.SAFARI && this.safariOptions_) {
      capabilities.merge(this.safariOptions_);

    } else if (browser === Browser.EDGE && this.edgeOptions_) {
      capabilities.merge(this.edgeOptions_);
    }

    checkOptions(
        capabilities, 'chromeOptions', chrome.Options, 'setChromeOptions');
    checkOptions(
        capabilities, 'moz:firefoxOptions', firefox.Options,
        'setFirefoxOptions');
    checkOptions(
        capabilities, 'safari.options', safari.Options, 'setSafariOptions');

    // Check for a remote browser.
    let url = this.url_;
    if (!this.ignoreEnv_) {
      if (process.env.SELENIUM_REMOTE_URL) {
        this.log_.fine(
            `SELENIUM_REMOTE_URL=${process.env.SELENIUM_REMOTE_URL}`);
        url = process.env.SELENIUM_REMOTE_URL;
      } else if (process.env.SELENIUM_SERVER_JAR) {
        this.log_.fine(
            `SELENIUM_SERVER_JAR=${process.env.SELENIUM_SERVER_JAR}`);
        url = startSeleniumServer(process.env.SELENIUM_SERVER_JAR);
      }
    }

    if (url) {
      this.log_.fine('Creating session on remote server');
      let client = Promise.resolve(url)
          .then(url => new _http.HttpClient(url, this.agent_, this.proxy_));
      let executor = new _http.Executor(client);

      if (browser === Browser.CHROME) {
        const driver = ensureFileDetectorsAreEnabled(chrome.Driver);
        return createDriver(driver, capabilities, executor);
      }

      if (browser === Browser.FIREFOX) {
        const driver = ensureFileDetectorsAreEnabled(firefox.Driver);
        return createDriver(driver, capabilities, executor);
      }
      return createDriver(WebDriver, executor, capabilities);
    }

    // Check for a native browser.
    switch (browser) {
      case Browser.CHROME: {
        let service = null;
        if (this.chromeService_) {
          service = this.chromeService_.build();
        }
        return createDriver(chrome.Driver, capabilities, service);
      }

      case Browser.FIREFOX: {
        let service = null;
        if (this.firefoxService_) {
          service = this.firefoxService_.build();
        }
        return createDriver(firefox.Driver, capabilities, service);
      }

      case Browser.INTERNET_EXPLORER:
        return createDriver(ie.Driver, capabilities);

      case Browser.EDGE: {
        let service = null;
        if (this.edgeService_) {
          service = this.edgeService_.build();
        }
        return createDriver(edge.Driver, capabilities, service);
      }

      case Browser.SAFARI:
        return createDriver(safari.Driver, capabilities);

      default:
        throw new Error('Do not know how to build driver: ' + browser
            + '; did you forget to call usingServer(url)?');
    }
  }
}


/**
 * In the 3.x releases, the various browser option classes
 * (e.g. firefox.Options) had to be manually set as an option using the
 * Capabilties class:
 *
 *     let ffo = new firefox.Options();
 *     // Configure firefox options...
 *
 *     let caps = new Capabilities();
 *     caps.set('moz:firefoxOptions', ffo);
 *
 *     let driver = new Builder()
 *         .withCapabilities(caps)
 *         .build();
 *
 * The options are now subclasses of Capabilities and can be used directly. A
 * direct translation of the above is:
 *
 *     let ffo = new firefox.Options();
 *     // Configure firefox options...
 *
 *     let driver = new Builder()
 *         .withCapabilities(ffo)
 *         .build();
 *
 * You can also set the options for various browsers at once and let the builder
 * choose the correct set at runtime (see Builder docs above):
 *
 *     let ffo = new firefox.Options();
 *     // Configure ...
 *
 *     let co = new chrome.Options();
 *     // Configure ...
 *
 *     let driver = new Builder()
 *         .setChromeOptions(co)
 *         .setFirefoxOptions(ffo)
 *         .build();
 *
 * @param {!Capabilities} caps
 * @param {string} key
 * @param {function(new: Capabilities)} optionType
 * @param {string} setMethod
 * @throws {error.InvalidArgumentError}
 */
function checkOptions(caps, key, optionType, setMethod) {
  let val = caps.get(key);
  if (val instanceof optionType) {
    throw new error.InvalidArgumentError(
        'Options class extends Capabilities and should not be set as key '
            + `"${key}"; set browser-specific options with `
            + `Builder.${setMethod}(). For more information, see the `
            + 'documentation attached to the function that threw this error');
  }
}


// PUBLIC API


exports.Browser = capabilities.Browser;
exports.Builder = Builder;
exports.Button = input.Button;
exports.By = by.By;
exports.Capabilities = capabilities.Capabilities;
exports.Capability = capabilities.Capability;
exports.Condition = webdriver.Condition;
exports.FileDetector = input.FileDetector;
exports.Key = input.Key;
exports.Session = session.Session;
exports.ThenableWebDriver = ThenableWebDriver;
exports.WebDriver = webdriver.WebDriver;
exports.WebElement = webdriver.WebElement;
exports.WebElementCondition = webdriver.WebElementCondition;
exports.WebElementPromise = webdriver.WebElementPromise;
exports.error = error;
exports.logging = logging;
exports.promise = promise;
exports.until = until;

;
//# sourceMappingURL=scripts.bundle.js.map