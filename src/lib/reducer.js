import Immutable from 'immutable'
import MAX_SAFE_INTEGER from 'max-safe-integer'
import extend from 'lodash.assign'

import { GriddleHelpers } from 'griddle-core'
const { data } = GriddleHelpers
const { getVisibleDataColumns } = data


export default function createReducer({ getDataColumns, getSortedColumns }) {
  const configured =  { AFTER_REDUCE: createAFTER_REDUCE({ getDataColumns, getSortedColumns })
                      , GRIDDLE_ROW_TOGGLED: createGRIDDLE_ROW_TOGGLED({ getDataColumns })
                      , GRIDDLE_LOADED_DATA_AFTER: createGRIDDLE_LOADED_DATA_AFTER({ getDataColumns })
                      }
  return (state, action) => {
    return  { AFTER_REDUCE: configured.AFTER_REDUCE(state, action)
            , GRIDDLE_ROW_TOGGLED: configured.GRIDDLE_ROW_TOGGLED(state, action)
            , GRIDDLE_LOADED_DATA_AFTER: configured.GRIDDLE_LOADED_DATA_AFTER(state, action)
            }
  }
}

const createAFTER_REDUCE = ({ getDataColumns, getSortedColumns }) => (state, action) => {
  const columns = getDataColumns(state, data)
  const properties = getProperties(columns)
  const data = transform(state.get('visibleData'), state, properties.childrenPropertyName)
  columns.push(properties.childrenPropertyName)
  return state
    .set('visibleData', sortChildren(getSortedColumns(getVisibleChildData(data, columns), columns), state, { getDataColumns, getSortedColumns }, properties.childrenPropertyName), columns)
}

const createGRIDDLE_ROW_TOGGLED = ({ getDataColumns }) => (state, action) => {
  const { griddleKey } = action
  const columns = getDataColumns(state, state.get('data'))
  const properties = getProperties(columns)

  return state.set('data', toggleExpanded(state.get('data'), griddleKey, properties.childrenPropertyName))
}

const createGRIDDLE_LOADED_DATA_AFTER = ({ getDataColumns }) => (state, action) => {
  const data = state.get('data')
  const columns = getDataColumns(state, data)
  const newData = setRowProperties(data, getProperties(columns))
  return state.set('data', newData)
}


/*
OVERALL TODO:
  fix column order
*/
const hasChildren = (record, childrenPropertyName = 'children') => record.get(childrenPropertyName) && record.get(childrenPropertyName).size > 0

function transform(data, state, childrenPropertyName = 'children') {
  let filter = state.get('filter')
  return filter === '' ? data : filterChildren(data, state.get('filter'), childrenPropertyName)
}

function sortChildren(data, state, helpers, childrenPropertyName = 'children') {
  const sortColumns = state.getIn(['sortProperties', 'sortColumns'])
  const sortAscending = state.getIn(['sortProperties', 'sortAscending'])
  const getSortedRows = (data, sort = false) => {
    const mappedData = data.map((row, index) => {
      return hasChildren(row) && row.getIn(['__metadata', 'expanded']) === true ?
        row.set('children', getSortedRows(row.get('children'), true)) :
        row
    })
    return sort ? helpers.getSortedData(mappedData, sortColumns, sortAscending) : mappedData
  }
  return !sortColumns || !helpers ? data : getSortedRows(data)
}



//TODO: Make this more efficient where it'll stop when it finds the record it's looking for
function toggleExpanded(data, griddleKey, childrenPropertyName = 'children') {
  return data.map(row => {
    let children = row.get(childrenPropertyName)

    if(children && children.size > 0)
      children = toggleExpanded(children, griddleKey)

    return row
      .set(childrenPropertyName, children)
      /* Sets the toggle status of the row either to what it is currently or the opposite if this is the one to toggle */
      .set('expanded', row.get('griddleKey') === griddleKey ?
        !row.get('expanded') :
        row.get('expanded'))
  })
}


//TODO: This is almost the same as the filterChildrenData method but not applying the filter method :/
function filterChildren(rows, filter, childrenPropertyName = 'children') {
  return rows.map(row => {
    let children = row.get(childrenPropertyName)

    if(children && children.size > 0) {
      children = filterChildrenData(row.get(childrenPropertyName), filter, childrenPropertyName)
    }

    return row
      .set(childrenPropertyName, children)
  })
}

function filterChildrenData(rows, filter, childrenPropertyName = 'children') {
  const values = rows.filter(row => {
    let children = row.get(childrenPropertyName)

    if(children && children.size > 0)
      children = filterChildrenData(row.get(childrenPropertyName), filter, childrenPropertyName)

    const hasMatch = (children && children.length > 0) || (Object.keys(row.toJSON())
      .some(key => {
        return row.get(key) && row.get(key).toString().toLowerCase().indexOf(filter.toLowerCase()) > -1
      }))

    return hasMatch
  })
  return values
}



function getProperties(columns) {
  return extend({ childrenPropertyName: 'children'
                , columns: []
                }, columns)
}

const hasMetadata = data => {
  const metadata = data.get(0).get('__metadata')
  return metadata && metadata.size > 0
}

//TODO: Refactor this logic -- This is probably way more expensive than it needs to be
export function getVisibleChildData(data, columns, childrenPropertyName = 'children') {
  if(data.size === 0) { return data }
  //get the data and make sure metadata is applied
  const dataWithMetadata = hasMetadata(data) ? data : getVisibleDataColumns(data, columns)

  //go through each visible child row and set it to use the correct column settings
  return dataWithMetadata.map((row, index) => {
    let children = row.get(childrenPropertyName)

    if(children && children.size > 0)
      children = getVisibleChildData(children, columns, childrenPropertyName)

    return row
      .set('children', children)
  })
}

export function setRowProperties(data, properties, depth = 0, parentId = null) {
  let key = 0
  const getKey = (() => key+= 1)

  return data.map((row, index) => {
    let children = row.get(properties.childrenPropertyName)
    let currentKey = parentId !== null ? `${parentId}.${getKey()}` : `${row.get('griddleKey')}`

    if(children && children.size > 0)
      children = setRowProperties(children, { childrenPropertyName: properties.childrenPropertyName, columns: properties.columns }, depth + 1, currentKey)

    return row
      .sortBy((val, key) => properties.columns.indexOf(key))
      .set('children', children)
      .set('depth', depth)
      .set('griddleKey', currentKey)
      .set('parentId', parentId)
      .set('expanded', false)
      .set('hasChildren', children && children.size > 0)
  })
}
