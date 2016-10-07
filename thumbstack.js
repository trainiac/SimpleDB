var SimpleDB;
var Commands;

function log(message) {
    console.log(message);
}

SimpleDB = {

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
               baz: 3,      baz has been set to 3 foo has been unset
               foo: null    in the second transaction
           }
       ]

       @type {Array}
       @private
    */
    _transactions: [],

    /**
       An object where keys are variable names and the values are
       objects that track if the variable name is referenced in the db and/or open
       transactions.

       Notes:
       - If there is nothing stored in the db and there are no open transactions,
         the object will be empty.
       - If a variable name is equal to one of the keys, it means the variable name
         is referenced in the db and/or one of the open transactions.
       - Once variable names are no longer referenced by transactions or the db
         (e.g. after a commit or rollback) the key is removed from the object.

       example:

       {
         foo: {
             transactions:[0, 3],    foo referenced in the 1st and 4th transaction
             db: true                and already has a value committed to the db
         },
         bar: {
             transactions: [1,2],     bar referenced in the 2nd and 3rd transaction
             db: false                but has not already been committed to the db
         }
       }

       @type {Object}
       @private
    */
    _references: {},

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
       Iterates through all the referenced variables and applies the
       most recent update to the variable to the db.

       @function commit
       @public
       @returns {undefined}
    */
    commit: function() {
        var name;
        var lastTransactionIndexNameIsUsed;

        // if there are no open transations return
        if (!this.hasTransactions()) {
            return false;
        }

        // process all open transactions
        for (name in this._references) {
            lastTransactionIndexNameIsUsed = this._lastTransactionIndexNameIsUsed(name);
            if (lastTransactionIndexNameIsUsed !== null) {
                // set the most recent value of a variable name to the db
                this._setToDB(name, this._transactions[lastTransactionIndexNameIsUsed][name]);
            }
        }

        // clean up transaction tracking
        this._transactions = [];

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
        if (!this.hasTransactions()) {
            return false;
        }

        // discard the most recent transaction
        transaction = this._transactions.pop();

        // clean up the references tracking
        for (name in transaction) {
            this._references[name].transactions.pop();
            if (
                !this._references[name].transactions.length &&
                !this._references[name].db
            ) {
                // if this variable name is no longer referenced
                // in any transactions and was never committed to the
                // db, it is no longer referenced and can be removed
                // from the references dict
                delete this._references[name];
            }
        }

        return true;
    },

    /**
       The most recent transaction value of the name will be returned if one exists
       or a db value of the name will be return if it exists. If the name doesn't exist
       null will be returned.

       @function get
       @public
       @param {string} name Name of the value to get.
       @returns {?string} Returns string or null
    */
    get: function(name) {
        var value;
        var lastTransactionIndexNameIsUsed;

        lastTransactionIndexNameIsUsed = this._lastTransactionIndexNameIsUsed(name);
        if (lastTransactionIndexNameIsUsed !== null) {
            value = this._transactions[lastTransactionIndexNameIsUsed][name];
        } else {
            value = this._db[name];
        }

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
        var currentTransaction;
        var currentTransactionIndex;
        var lastTransactionIndexNameIsUsed;

        if (this.hasTransactions()) {
            currentTransactionIndex = this._transactions.length - 1;
            currentTransaction = this._transactions[currentTransactionIndex];

            // set name value pair in current transaction
            currentTransaction[name] = value;

            if (this._references[name]) {
                lastTransactionIndexNameIsUsed = this._lastTransactionIndexNameIsUsed(name);

                // only add the currentTransactionIndex to the references if it doesn't
                // already exist. e.g. if set(foo, 3) is called twice in the same transaction
                // duplicate references should not be added.
                if (lastTransactionIndexNameIsUsed !== currentTransactionIndex) {
                    this._references[name].transactions.push(currentTransactionIndex);
                }
            } else {
                // If a reference doesn't already exist to this variable and there are
                // open transactions that means it's not stored in the db and we
                // need to start tracking the references to it within transactions
                this._references[name] = {
                    transactions: [ currentTransactionIndex ],
                    db: false
                };
            }
        } else {
            // There are no open transactions so set directly on db.
            this._setToDB(name, value);
        }
    },

    /**
       Sets the value of a given name to null
       @function unset
       @public
       @param {string} name Name to unset
       @returns {undefined}
    */
    unset: function(name) {
        this.set(name, null);
    },

    /**
       Iterates through the variable references and looks at the most
       recent transaction value if one exists and then the db value if
       it exists counting the number variables that have a given value.

       @function numEqualTo
       @public
       @param {string} value The value to be counted
       @returns {number} The number of occurrences of the given value
    */
    numEqualTo: function(value) {
        var num = 0;
        var name;

        for (name in this._references) {
            if (this.get(name) === value) {
                num += 1;
            }
        }

        return num;
    },

    /**
       Determines whether there are any open transactions.

       @function hasTransactions
       @public
       @returns {Boolean} Where there are any open transactions
    */
    hasTransactions: function() {
        return this._transactions.length > 0;
    },

    clear: function() {
        this._transactions = [];
        this._db = {};
        this._references = {};
    },

    /**
       @function _setToDB
       @desc Sets a given name value to the db.  If the value being set is null
             this will effectively delete the name leaving nothing store for that
             name.
       @public
       @param {string} name The name of the value to be set.
       @param {string} value The value to be set.
       @returns {undefined}
    */
    _setToDB: function(name, value) {
        if (value === null) {
            delete this._db[name];
            delete this._references[name];
        } else {
            this._db[name] = value;
            this._references[name] = {
                db: true,
                transactions: []
            }
        }
    },

    /**
       @function _lastTransactionIndexNameIsUsed
       @desc Given a name searches for the last transaction, if any, where the name is
             referenced.
       @private
       @param {string} name The name to
       @returns {?number} The index number of the transaction will be returned if the
                          name is referenced in an open transaction and null will be
                          returned if it is not.
    */
    _lastTransactionIndexNameIsUsed: function(name) {
        var nameReferences = this._references[name];
        var nameTransactions;

        if (nameReferences) {
            nameTransactions = nameReferences.transactions;
            if (nameTransactions.length) {
                return nameTransactions[nameTransactions.length - 1];
            }
        }

        return null;
    }
};

Commands = {
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

