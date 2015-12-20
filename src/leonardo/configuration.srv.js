angular.module('leonardo').factory('leoConfiguration',
    ['leoStorage', '$httpBackend', '$rootScope', function(leoStorage, $httpBackend, $rootScope) {
  var states = [],
      _scenarios = {},
      responseHandlers = {},
      _requestsLog = [],
      _savedStates = [];

  // Core API
  // ----------------
  return {
    // Add a new state which you wish to mock - there a two types of states - one with url and one without.
    addState: addState,
    addStates: addStates,
    getState: getState,
    getStates: fetchStates,
    deactivateState: deactivateState,
    deactivateAllStates: deactivateAll,
    activateStateOption: activateStateOption,
    addScenario: addScenario,
    addScenarios: addScenarios,
    getScenario: getScenario,
    getScenarios: getScenarios,
    setActiveScenario: setActiveScenario,
    getRecordedStates: getRecordedStates,
    getRequestsLog: getRequestsLog,
    loadSavedStates: loadSavedStates,
    addSavedState: addSavedState,
    removeState: removeState,
    //Private api for passing through unregistered urls to $http
    _requestSubmitted: requestSubmitted,
    _logRequest: logRequest
  };

  function upsertOption(state, name, active) {
    var _states = leoStorage.getStates();
    _states[state] = {
      name: name || findStateOption(state).name,
      active: active
    };

    leoStorage.setStates(_states);

    sync();
  }

  function fetchStatesByUrl(url, method){
    return fetchStates().filter(function(state){
      return state.url && new RegExp(state.url).test(url) && state.verb.toLowerCase() === method.toLowerCase();
    });
  }

  function fetchStates(){
    var activeStates = leoStorage.getStates();
    var _states = states.map(function(state) {
      return angular.copy(state);
    });

    _states.forEach(function(state) {
      var option = activeStates[state.name];
      state.active = !!option && option.active;
      state.activeOption = !!option ?
        state.options.filter(function (_option) {
          return _option.name === option.name;
        })[0] : state.options[0];
    });

    return _states;
  }

  function deactivateAll() {
    var _states = leoStorage.getStates();
    Object.keys(_states).forEach(function(stateKey) {
      _states[stateKey].active = false;
    });
    leoStorage.setStates(_states);

    sync();
  }

  function findStateOption(name){
    return fetchStates().filter(function(state){ return state.name === name;})[0].activeOption;
  }

  function sync() {
    fetchStates().forEach(function (state) {
      var option, responseHandler;
      if (state.url) {
        option = findStateOption(state.name);
        responseHandler = getResponseHandler(state);
        if (state.active) {
          responseHandler.respond(function () {
            $httpBackend.setDelay(option.delay);
            return [option.status, angular.isFunction(option.data) ? option.data() : option.data];
          });
        } else {
          responseHandler.passThrough();
        }
      }
    });
  }

  function getResponseHandler(state) {
    var url = state.url;
    var verb = state.verb === 'jsonp' ? state.verb : state.verb.toUpperCase();
    var key = (url + '_' + verb).toUpperCase();

    var escapedUrl = url.replace(/[?]/g, '\\?');
    if (!responseHandlers[key]) {
      if (state.verb === 'jsonp'){
        responseHandlers[key] = $httpBackend.whenJSONP(new RegExp(escapedUrl));
      }
      else {
        responseHandlers[key] = $httpBackend.when(verb || 'GET', new RegExp(escapedUrl));
      }
    }
    return responseHandlers[key];
  }

  function getState(name){
    var state = fetchStates().filter(function(state) { return state.name === name})[0];
    return (state && state.active && findStateOption(name)) || null;
  }

  function addState(stateObj) {
    stateObj.options.forEach(function (option) {
      upsert({
        state: stateObj.name,
        url: stateObj.url,
        verb: stateObj.verb,
        name: option.name,
        status: option.status,
        data: option.data,
        delay: option.delay
      });
    });

    $rootScope.$broadcast('leonardo:stateChanged', stateObj);
  }

  function addStates(statesArr) {
    if (angular.isArray(statesArr)) {
      statesArr.forEach(function(stateObj) {
        addState(stateObj);
      });
    } else {
      console.warn('leonardo: addStates should get an array');
    }
  }

  function upsert(stateObj) {
    var verb = stateObj.verb || 'GET',
        state = stateObj.state,
        name = stateObj.name,
        url = stateObj.url,
        status = stateObj.status || 200,
        data = angular.isDefined(stateObj.data) ? stateObj.data : {},
        delay = stateObj.delay || 0;
    var defaultState = {};

    var defaultOption = {};

    if (!state) {
      console.log("leonardo: cannot upsert - state is mandatory");
      return;
    }

    var stateItem = states.filter(function(_state) { return _state.name === state;})[0] || defaultState;

    angular.extend(stateItem, {
      name: state,
      url: url || stateItem.url,
      verb: verb,
      options: stateItem.options || []
    });


    if (stateItem === defaultState) {
      states.push(stateItem);
    }

    var option = stateItem.options.filter(function(_option) {return _option.name === name})[0] || defaultOption;

    angular.extend(option, {
      name: name,
      status: status,
      data: data,
      delay: delay
    });

    if (option === defaultOption) {
      stateItem.options.push(option);
    }
    sync();
  }

  function addScenario(scenario){
    if (scenario && typeof scenario.name === 'string') {
      _scenarios[scenario.name] = scenario;
    } else {
      throw 'addScenario method expects a scenario object with name property';
    }
  }

  function addScenarios(scenarios){
    angular.forEach(scenarios, addScenario);
  }

  function getScenarios(){
    return Object.keys(_scenarios);
  }

  function getScenario(name){
    if (!_scenarios[name]) {
      return;
    }
    return _scenarios[name].states;
  }

  function setActiveScenario(name){
    var scenario = getScenario(name);
    if (!scenario) {
      console.warn("leonardo: could not find scenario named " + name);
      return;
    }
    deactivateAll();
    scenario.forEach(function(state){
      upsertOption(state.name, state.option, true);
    });
  }

  function activateStateOption(state, optionName) {
    upsertOption(state, optionName, true);
  }

  function deactivateState(state) {
    upsertOption(state, null, false);
  }

  function requestSubmitted(requestConfig){
    var url = requestConfig.url;
    var method = requestConfig.method;

    var state = fetchStatesByUrl(url, method)[0];
    var handler = getResponseHandler(state || {
        url: url,
        verb: method
      });
    if (!state) {
      handler.passThrough();
    }
  }

  function logRequest(method, url, data, status) {
    if (method && url && !(url.indexOf(".html") > 0)) {
      var req = {
        verb: method,
        data: data,
        url: url.trim(),
        status: status,
        timestamp: new Date()
      };
      req.state = fetchStatesByUrl(req.url, req.verb)[0];
      _requestsLog.push(req);
    }
  }

  function getRequestsLog() {
    return _requestsLog;
  }

  function loadSavedStates() {
    _savedStates = leoStorage.getSavedStates();
    addStates(_savedStates);
  }

  function addSavedState(state) {
    _savedStates.push(state);
    leoStorage.setSavedStates(_savedStates);
    addState(state);
  }

  function removeState(state) {
    if (angular.isArray(statesArr)) {
      statesArr.forEach(function(stateObj) {
        addState(stateObj);
      });
    } else {
      console.warn('leonardo: addStates should get an array');
    }
  }

  function getRecordedStates() {
    var requestsArr = _requestsLog
          .map(function(req){
            var state = fetchStatesByUrl(req.url, req.verb)[0];
            return {
              name: state ? state.name : req.verb + " " + req.url,
              verb: req.verb,
              url: req.url,
              options: [{
                name: req.status >= 200 && req.status < 300 ? 'Success' : 'Failure',
                status: req.status,
                data: req.data
              }]
            }
          });
    console.log(angular.toJson(requestsArr, true));
    return requestsArr;
  }
}]);
