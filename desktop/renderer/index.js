/* @flow */

import React, {Component} from '../../react-native/react/base-react'
import ReactDOM from 'react-dom'
import {Provider} from 'react-redux'
import configureStore from '../../react-native/react/store/configure-store'
import Nav from '../../react-native/react/nav'
import injectTapEventPlugin from 'react-tap-event-plugin'
import ListenForNotifications from '../../react-native/react/native/notifications'
import ListenLogUi from '../../react-native/react/native/listen-log-ui'

// For Remote Components
import {ipcRenderer} from 'electron'
import RemoteManager from '../../react-native/react/native/remote-manager'
import {ipcMain} from 'remote'
import consoleHelper from '../app/console-helper'
import _ from 'lodash'

consoleHelper()

if (module.hot) {
  module.hot.accept()
}

const store = configureStore()

function NotifyPopup (title: string, opts: Object): void {
  new Notification(title, opts) //eslint-disable-line
}

// Shallow diff of two objects, returns an object that can be merged with
// the oldObj to yield the newObj. Doesn't handle deleted keys.
function shallowDiff (oldObj: Object, newObj: Object): Object {
  return Object.keys(newObj).reduce((acc, k) => newObj[k] !== oldObj[k] ? (acc[k] = newObj[k]) && acc : acc, {})
}

class Keybase extends Component {
  constructor () {
    super()

    this.state = {
      panelShowing: false
    }

    if (__DEV__) { // eslint-disable-line no-undef
      if (typeof window !== 'undefined') {
        window.addEventListener('keydown', event => {
          if (event.ctrlKey && event.keyCode === 72) {
            this.setState({panelShowing: !this.state.panelShowing})
          }
        })
      }
    }

    // Used by material-ui widgets.
    injectTapEventPlugin()

    // For remote window components
    ipcMain.removeAllListeners('dispatchAction')
    ipcMain.removeAllListeners('stateChange')
    ipcMain.removeAllListeners('subscribeStore')

    ipcMain.on('dispatchAction', (event, action) => {
      // we MUST clone this else we'll run into issues with redux. See https://github.com/rackt/redux/issues/830
      // This is because we get a remote proxy object, instead of a normal object
      setImmediate(() => store.dispatch(_.cloneDeep(action)))
    })

    ipcMain.on('subscribeStore', (event, substore) => {
      const sender = event.sender // cache this since this is actually a sync-rpc call...

      // Keep track of the last state sent so we can make the diffs.
      let oldState = {}
      const getStore = () => {
        if (substore) {
          return store.getState()[substore] || {}
        } else {
          const newState = store.getState()
          const diffState = shallowDiff(oldState, newState) || {}
          oldState = newState
          return diffState
        }
      }

      console.log('setting up remote store listener')
      sender.send('stateChange', getStore())
      store.subscribe(() => {
        const newState = getStore()
        console.log('Sending state change!', newState)
        if (Object.keys(newState).length !== 0) {
          console.log('There was a difference!', newState)
          sender.send('stateChange', newState)
        }
      })
    })

    ipcRenderer.send('remoteStoreReady')

    // Handle notifications from the service
    ListenForNotifications(store.dispatch, NotifyPopup)

    // Handle logUi.log
    ListenLogUi()
  }

  render () {
    let dt = null
    if (__DEV__) { // eslint-disable-line no-undef
      const DevTools = require('./redux-dev-tools')
      dt = <DevTools />
    }

    return (
      <Provider store={store}>
        <div style={{display: 'flex', flex: 1}}>
          <RemoteManager />
          <Nav />
          {dt}
        </div>
      </Provider>
    )
  }
}

ReactDOM.render(<Keybase/>, document.getElementById('app'))
