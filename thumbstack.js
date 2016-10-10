
var SimpleDB = {

    /**
       Stores the committed state of the data.

       example:

       {
           foo: '1',    foo and bar are stored in the db
           bar: '2'
       }

       @type {Object}
       @private
    */
    _db: {},

    /**
       An array of Objects that represent transactions in order of oldest to newest.
       If list is empty, there are no open transactions.

       example:

       [
           {
               foo: 1,      foo has been set to 1 and bar set to 2
               bar: 2       in the first transaction
           },
           {
               baz: 3,      baz has been set to 3 and foo has been unset
               foo: null    in the second transaction
           }
       ]

       @type {Array}
       @private
    */
    _transactions: [],

    /**
       An object where keys are variable names and the values are
       arrays of the indices to the transactions array where the variable names are
       referenced.

       Notes:
       - If there are no open transactions the object will be empty.
       - If a variable name is equal to one of the keys, it means the variable name
         one of the open transactions.
       - Once variable names are no longer referenced by transactions
         (e.g. after a commit or rollback) the key is removed from the object.

       example:

       {
         foo: [0, 3],    foo referenced in the 1st and 4th transaction
         bar: [1, 2],    bar referenced in the 2nd and 3rd transaction
       }

       @type {Object}
       @private
    */
    _transactionIndicesByName: {},

    /**
       An object where keys are variable names and the values are either equal to the
       db value or the latest transaction value for that variable name if one exists.

       Notes:
       - If a variable name is ever unset it is removed from currentValues.

       example:

       {
           foo: '1',    foo and bar are stored in currentValues
           bar: '2'
       }

       @type {Object}
       @private
    */
    _currentValues: {},

    /**
       An object where the keys are existing values being stored and the values are the
       the number of variable names that have that corresponding value.

       example:

       {
           1: 3,    There are three variable names with a value of 1 and two variable
           2: 2     names with a value of 2.
       }

       @type {Object}
       @private
    */
    _valuesCount: {},

    /**
       Creates a new empty transaction and appends it to the transactions array.

       @function begin
       @public
       @returns {undefined}
    */
    begin: function() {
        this._transactions.push({});
    },

    /**
       Iterates through all the variable names that have commits and applies the
       most recent values to the db.

       @function commit
       @public
       @returns {undefined}
    */
    commit: function() {
        var name;
        var value;

        // if there are no open transations return
        if (!this._hasTransactions()) {
            return false;
        }

        // process all variable names that have updates.
        for (name in this._transactionIndicesByName) {
            // If the variable name is in current values then use that value
            // If the variable name is not in current values that means it was
            // removed because it was a null value
            value = name in this._currentValues ? this._currentValues[name] : null;
            this._setToDB(name, value);
        }

        // clean up transaction tracking
        this._transactions = [];
        this._transactionIndicesByName = {};

        // at least one transaction commit was processed
        return true;
    },

    /**
       Discards the most recent transaction block.
       @function rollback
       @public
       @returns {undefined}
    */
    rollback: function() {
        var transaction;
        var name;

        // if there are no open transactions return
        if (!this._hasTransactions()) {
            return false;
        }

        // discard the most recent transaction
        transaction = this._transactions.pop();

        // rollback currentValues for any variable names referenced in
        // the transaction being rollbacked
        for (name in transaction) {
            this._rollbackName(name);
        }

        // a transaction rollback was processed
        return true;
    },

    /**
       The most recent transaction value of the variable name will be returned if one exists
       or a db value will be return if it exists. If the variable name doesn't exist
       null will be returned.

       @function get
       @public
       @param {string} name Name of the value to get.
       @returns {?string} Returns string or null
    */
    get: function(name) {
        var value = this._currentValues[name];
        return value === undefined ? null : value;
    },

    /**
       If there are open transactions the name value pair will be set in the
       most recent transaction otherwise the name value pair will be set directly
       in the db.

       @function set
       @public
       @param {string} name Name of value to be set.
       @param {string} value Value to be set.
       @returns {undefined}
    */
    set: function(name, value) {
        if (this._hasTransactions()) {
            // There are open transactions so set to current transaction
            this._setToCurrentTransaction(name, value);
        } else {
            // There are no open transactions so set directly on db.
            this._setToDB(name, value);
        }

        // Always update current values
        this._setToCurrentValues(name, value);
    },

    /**
       Unset the value of a given name
       @function unset
       @public
       @param {string} name Name to unset
       @returns {undefined}
    */
    unset: function(name) {
        this.set(name, null);
    },

    /**
       Returns the number of variables equal to the given value

       @function numEqualTo
       @public
       @param {string} value The value to find the count for
       @returns {number} The number of occurrences of the given value
    */
    numEqualTo: function(value) {
        var num = this._valuesCount[value];
        return num === undefined ? 0 : num;
    },

    /**
       Clears the state

       @function clear
       @public
       @returns {undefined}
    */
    clear: function() {
        this._transactions = [];
        this._transactionIndicesByName = {};
        this._db = {};
        this._currentValues = {};
        this._valuesCount = {};
    },

    /**
       Returns the internal state

       @function inspect
       @public
       @returns {Object} The internal state
    */
    inspect: function() {
        return {
            transactions: this._transactions,
            transactionIndicesByName: this._transactionIndicesByName,
            db: this._db,
            currentValues: this._currentValues,
            valuesCount: this._valuesCount
        }
    },

    /**
       Determines whether there are any open transactions.

       @function hasTransactions
       @private
       @returns {Boolean} Where there are any open transactions
    */
    _hasTransactions: function() {
        return this._transactions.length > 0;
    },

    /**
       Rollsback a given variable name to it's previous value.

       @function hasTransactions
       @private
       @param {string} name Name of variable to rollback
       @returns {Boolean} Where there are any open transactions
    */
    _rollbackName: function(name) {
        var value;
        var lastTransactionIndexNameIsUsed;
        var nameTransactionIndices = this._transactionIndicesByName[name];

        nameTransactionIndices.pop();
        if (!nameTransactionIndices.length) {
            // if the variable name is no longer referenced
            // in any transactions it will revert to the db value
            // otherwise it will be treated as unset
            delete this._transactionIndicesByName[name];
            value = name in this._db ? this._db[name] : null;
        } else {
            // if the variable name is still referenced in transactions
            // use the last transaction value
            lastTransactionIndexNameIsUsed = this._getLastTransactionIndexNameIsUsed(name);
            value = this._transactions[lastTransactionIndexNameIsUsed][name];
        }

        this._setToCurrentValues(name, value);
    },

    /**
       @function _setToDB
       @desc Sets a given name value to the db.  If the value being set is null
             this will effectively delete the name leaving nothing to store for that
             name.
       @private
       @param {string} name The name of the value to be set.
       @param {string} value The value to be set.
       @returns {undefined}
    */
    _setToDB: function(name, value) {
        if (value === null) {
            delete this._db[name];
        } else {
            this._db[name] = value;
        }
    },

    /**
       @function _setToCurrentValues
       @desc Sets a given name value to the currentValues and updates valuesCount.
             If the value being set is null this will effectively delete the name
             leaving nothing to store for that name.
       @private
       @param {string} name The name of the value to be set.
       @param {string} value The value to be set.
       @returns {undefined}
    */
    _setToCurrentValues: function(name, value) {
        var oldValue = this._currentValues[name];

        if (value === null) {
            delete this._currentValues[name];
        } else {
            this._currentValues[name] = value;
            if (this._valuesCount[value] === undefined) {
                this._valuesCount[value] = 1;
            } else if (oldValue !== value) {
                this._valuesCount[value] += 1
            }
        }

        if (
            oldValue !== undefined &&
            this._valuesCount[oldValue] !== undefined &&
            oldValue !== value
        ) {
            this._valuesCount[oldValue] -= 1
            if (this._valuesCount[oldValue] < 1) {
                delete this._valuesCount[oldValue];
            }
        }
    },

    /**
       @function _setToCurrentTransaction
       @desc Sets a given name value to the current transaction
       @private
       @param {string} name The name of the value to be set.
       @param {string} value The value to be set.
       @returns {undefined}
    */
    _setToCurrentTransaction: function(name, value) {
        var currentTransactionIndex = this._transactions.length - 1;
        var currentTransaction = this._transactions[currentTransactionIndex];
        var lastTransactionIndexNameIsUsed;


        // set name value pair in current transaction
        currentTransaction[name] = value;

        lastTransactionIndexNameIsUsed = this._getLastTransactionIndexNameIsUsed(name);
        if (lastTransactionIndexNameIsUsed !== null) {
            // only add the currentTransactionIndex to the transactionIndicesByName
            // if it doesn't already exist.
            // e.g. if set(foo, 3) is called twice in the same transaction
            // duplicate indices should not be added.
            if (lastTransactionIndexNameIsUsed !== currentTransactionIndex) {
                this._transactionIndicesByName[name].push(currentTransactionIndex);
            }
        } else {
            // If this variable name is not referenced in any transactions yet we
            // need to start tracking the indices it's referenced in.
            this._transactionIndicesByName[name] = [ currentTransactionIndex ];
        }
    },

    /**
       @function _getLastTransactionIndexNameIsUsed
       @desc Given a name searches for the last transaction index, if any, where the name is
             referenced within the transaction array.
       @private
       @param {string} name The name to
       @returns {?number} The index number of the transaction will be returned if the
                          name is referenced in an open transaction and null will be
                          returned if it is not.
    */
    _getLastTransactionIndexNameIsUsed: function(name) {
        var nameTransactionIndices = this._transactionIndicesByName[name];

        if (nameTransactionIndices && nameTransactionIndices.length) {
            return nameTransactionIndices[nameTransactionIndices.length - 1];
        }

        return null;
    }
};

var Commands = {
    BEGIN: function() {
        SimpleDB.begin();
    },
    COMMIT: function() {
        var result = SimpleDB.commit();
        if (!result) {
            log('NO TRANSACTION');
        }
    },
    ROLLBACK: function() {
        var result = SimpleDB.rollback();
        if (!result) {
            log('NO TRANSACTION');
        }
    },
    END: function() { },
    GET: function(name) {
        var value = SimpleDB.get(name);
        value = value === null ? 'NULL' : value;
        log('> ' + value);
    },
    SET: function(name, value) {
        SimpleDB.set(name, value);
    },
    UNSET: function(name) {
        SimpleDB.unset(name);
    },
    NUMEQUALTO: function(name) {
        log('> ' + SimpleDB.numEqualTo(name));
    }
}

/**
   Shorthand for console.log

   @function log
   @param {string} message A message to log
   @returns {undefined}
*/
function log(message) {
    console.log(message);
}

/**
   Given a string of SimpleDB commands, parses the string and executes the commands.

   @function processInput
   @param {string} input A series of SimpleDB commands.
   @returns {undefined}
*/
function processInput(input) {  // eslint-disable-line no-unused-vars
    var lines = input.split('\n');
    var line;
    var i;
    var args;
    var command;

    for (i = 0; i < lines.length; i++) {
        line = lines[i];
        log(line);
        args = line.split(' ');
        command = args[0];
        args.shift();
        Commands[command].apply(this, args);
    }
}

module.exports = {
    processInput: processInput,
    log: log,
    SimpleDB: SimpleDB
}

