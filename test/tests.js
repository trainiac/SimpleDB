/* eslint-env mocha */
var rewire = require('rewire');
var mod = rewire('../thumbstack.js');
var SimpleDB = mod.SimpleDB;
var processInput = mod.processInput;
var messages = [];
var originalLog = mod.__get__('log');

function stubLog(message) {
    messages.push(message);
}

mod.__set__({
    log: stubLog
})

describe('SimpleDB commands', function() {
    afterEach(function() {
        SimpleDB.clear();
        messages = []
    })

    it('should return NULL when getting an unset value', function() {
        processInput('GET a')
        messages.should.eql([ 'GET a', '> NULL' ]);
    });

    it('should set a value', function() {
        var internals;
        processInput([ 'SET foo 3', 'GET foo' ].join('\n'));
        messages.should.eql([ 'SET foo 3', 'GET foo', '> 3' ]);
        internals = SimpleDB.inspect();
        internals.transactions.should.eql([]);
        internals.transactionIndicesByName.should.eql({});
        internals.db.should.eql({
            foo: '3'
        });
        internals.currentValues.should.eql({
            foo: '3'
        });
    });

    it('should unset a value', function() {
        var internals;
        processInput([ 'SET foo 3', 'UNSET foo' ].join('\n'));
        messages.should.eql([ 'SET foo 3', 'UNSET foo' ]);
        internals = SimpleDB.inspect();
        internals.transactions.should.eql([]);
        internals.transactionIndicesByName.should.eql({});
        internals.db.should.eql({});
        internals.currentValues.should.eql({});
    });

    it('should count values', function() {
        var internals;
        processInput([
            'NUMEQUALTO 3',
            'SET foo 3',
            'NUMEQUALTO 3',
            'NUMEQUALTO 4'
        ].join('\n'));

        messages.should.eql([
            'NUMEQUALTO 3',
            '> 0',
            'SET foo 3',
            'NUMEQUALTO 3',
            '> 1',
            'NUMEQUALTO 4',
            '> 0'
        ]);
        internals = SimpleDB.inspect();
        internals.transactions.should.eql([]);
        internals.transactionIndicesByName.should.eql({});
        internals.db.should.eql({
            foo: '3'
        });
        internals.currentValues.should.eql({
            foo: '3'
        });
    });

    it('should do nothing on END', function() {
        var internals;
        processInput([ 'END' ].join('\n'));
        messages.should.eql([
            'END'
        ]);
        internals = SimpleDB.inspect();
        internals.transactions.should.eql([]);
        internals.transactionIndicesByName.should.eql({});
        internals.db.should.eql({});
    });

    it('should output NO TRANSACTION if ROLLBACK called with no transactions', function() {
        var internals;
        processInput([ 'ROLLBACK' ].join('\n'));
        messages.should.eql([
            'ROLLBACK',
            'NO TRANSACTION'
        ]);
        internals = SimpleDB.inspect();
        internals.transactions.should.eql([]);
        internals.transactionIndicesByName.should.eql({});
        internals.db.should.eql({});
        internals.currentValues.should.eql({});
    });

    it('should output NO TRANSACTION if COMMIT called with no transactions', function() {
        var internals;
        processInput([ 'COMMIT' ].join('\n'));
        messages.should.eql([
            'COMMIT',
            'NO TRANSACTION'
        ]);
        internals = SimpleDB.inspect();
        internals.transactions.should.eql([]);
        internals.transactionIndicesByName.should.eql({});
        internals.db.should.eql({});
        internals.currentValues.should.eql({});
    });

    it('should create new transaction with BEGIN command', function() {
        var internals;
        processInput([ 'BEGIN' ].join('\n'));
        messages.should.eql([
            'BEGIN'
        ]);
        internals = SimpleDB.inspect();
        internals.transactions.should.eql([ {} ]);
        internals.transactionIndicesByName.should.eql({});
        internals.db.should.eql({});
        internals.currentValues.should.eql({});
    });

    it('should remove a transaction with ROLLBACK command', function() {
        var internals;
        processInput([ 'BEGIN', 'ROLLBACK' ].join('\n'));
        messages.should.eql([
            'BEGIN',
            'ROLLBACK'
        ]);
        internals = SimpleDB.inspect();
        internals.transactions.should.eql([]);
        internals.transactionIndicesByName.should.eql({});
        internals.db.should.eql({});
        internals.currentValues.should.eql({});
    });

    it('should commit a transaction with COMMIT command', function() {
        var internals;
        processInput([ 'BEGIN', 'SET foo 3', 'COMMIT' ].join('\n'));
        messages.should.eql([
            'BEGIN',
            'SET foo 3',
            'COMMIT'
        ]);
        internals = SimpleDB.inspect();
        internals.transactions.should.eql([]);
        internals.transactionIndicesByName.should.eql({});
        internals.db.should.eql({
            foo: '3'
        });
        internals.currentValues.should.eql({
            foo: '3'
        });
    });

    it('should commit a transaction with existing values with COMMIT command', function() {
        var internals;
        processInput([
            'SET foo 3',
            'SET bar 4',
            'BEGIN',
            'SET foo 2',
            'COMMIT'
        ].join('\n'));
        messages.should.eql([
            'SET foo 3',
            'SET bar 4',
            'BEGIN',
            'SET foo 2',
            'COMMIT'
        ]);
        internals = SimpleDB.inspect();
        internals.transactions.should.eql([]);
        internals.transactionIndicesByName.should.eql({});
        internals.db.should.eql({
            foo: '2',
            bar: '4'
        });
        internals.currentValues.should.eql({
            foo: '2',
            bar: '4'
        });
    });

    it('should rollback updates to existing value with ROLLBACK command', function() {
        var internals;
        processInput([ 'SET foo 2', 'BEGIN', 'SET foo 3', 'ROLLBACK' ].join('\n'));
        messages.should.eql([
            'SET foo 2',
            'BEGIN',
            'SET foo 3',
            'ROLLBACK'
        ]);
        internals = SimpleDB.inspect();
        internals.transactions.should.eql([]);
        internals.transactionIndicesByName.should.eql({});
        internals.db.should.eql({
            foo: '2'
        });
        internals.currentValues.should.eql({
            foo: '2'
        });
    });

    it('should rollback updates with ROLLBACK command', function() {
        var internals;
        processInput([ 'BEGIN', 'SET foo 3', 'ROLLBACK' ].join('\n'));
        messages.should.eql([
            'BEGIN',
            'SET foo 3',
            'ROLLBACK'
        ]);
        internals = SimpleDB.inspect();
        internals.transactions.should.eql([]);
        internals.transactionIndicesByName.should.eql({});
        internals.db.should.eql({});
        internals.currentValues.should.eql({});
    });

    it('should get value from most recent transaction', function() {
        var internals;
        processInput([ 'SET foo 2', 'BEGIN', 'SET foo 3', 'GET foo' ].join('\n'));
        messages.should.eql([
            'SET foo 2',
            'BEGIN',
            'SET foo 3',
            'GET foo',
            '> 3'
        ]);
        internals = SimpleDB.inspect();
        internals.transactions.should.eql([ { foo: '3' } ]);
        internals.transactionIndicesByName.should.eql({ foo: [ 0 ] });
        internals.db.should.eql({
            foo: '2'
        });
        internals.currentValues.should.eql({
            foo: '3'
        });
    });

    it('SET should be idempotent within transactions', function() {
        var internals;
        processInput([ 'SET foo 2', 'BEGIN', 'SET foo 3', 'SET foo 3' ].join('\n'));
        messages.should.eql([
            'SET foo 2',
            'BEGIN',
            'SET foo 3',
            'SET foo 3'
        ]);
        internals = SimpleDB.inspect();
        internals.transactions.should.eql([ { foo: '3' } ]);
        internals.transactionIndicesByName.should.eql({ foo: [ 0 ] });
        internals.db.should.eql({
            foo: '2'
        });
        internals.currentValues.should.eql({
            foo: '3'
        });
    });

    it('log should not blow up', function() {
        mod.__set__({
            log: originalLog
        });
        mod.log('woohoo');
        mod.__set__({
            log: stubLog
        });
    });

    it([
        'should support sets, gets, unsets, and numequaltos',
        'within nested transactions and be able to rollback those transactions'
    ].join(' '), function() {
        var internals;
        processInput([
            'SET bar 2', 'SET baz 3', 'SET quw 4',
            'BEGIN',
            'SET foo 1', 'SET baz 4',
            'BEGIN',
            'SET quw 5', 'NUMEQUALTO 4', 'GET baz',
            'BEGIN',
            'UNSET bar', 'GET bar',
            'ROLLBACK',
            'GET foo', 'GET bar', 'NUMEQUALTO 2', 'GET baz', 'GET quw'
        ].join('\n'));
        messages.should.eql([
            'SET bar 2', 'SET baz 3', 'SET quw 4',
            'BEGIN',
            'SET foo 1', 'SET baz 4',
            'BEGIN',
            'SET quw 5', 'NUMEQUALTO 4', '> 1', 'GET baz', '> 4',
            'BEGIN',
            'UNSET bar', 'GET bar', '> NULL',
            'ROLLBACK',
            'GET foo', '> 1',
            'GET bar', '> 2',
            'NUMEQUALTO 2', '> 1',
            'GET baz', '> 4',
            'GET quw', '> 5'
        ]);
        internals = SimpleDB.inspect();
        internals.transactions.should.eql([ {
            foo: '1',
            baz: '4'
        }, {
            quw: '5'
        } ]);
        internals.transactionIndicesByName.should.eql({
            foo: [ 0 ],
            baz: [ 0 ],
            quw: [ 1 ]
        });
        internals.db.should.eql({
            bar: '2',
            baz: '3',
            quw: '4'
        });
        internals.currentValues.should.eql({
            foo: '1',
            bar: '2',
            baz: '4',
            quw: '5'
        });
    });

    it([
        'should support sets, gets, unsets, and numequaltos',
        'within nested transactions and be able to commit those transactions'
    ].join(' '), function() {
        var internals;
        processInput([
            'SET bar 2', 'SET baz 3', 'SET quw 4',
            'BEGIN',
            'SET foo 1', 'SET baz 4',
            'BEGIN',
            'SET quw 5', 'NUMEQUALTO 4', 'GET baz',
            'BEGIN',
            'UNSET bar', 'GET bar',
            'COMMIT',
            'GET foo', 'GET bar', 'NUMEQUALTO 2', 'GET baz', 'GET quw'
        ].join('\n'));
        messages.should.eql([
            'SET bar 2', 'SET baz 3', 'SET quw 4',
            'BEGIN',
            'SET foo 1', 'SET baz 4',
            'BEGIN',
            'SET quw 5', 'NUMEQUALTO 4', '> 1', 'GET baz', '> 4',
            'BEGIN',
            'UNSET bar', 'GET bar', '> NULL',
            'COMMIT',
            'GET foo', '> 1',
            'GET bar', '> NULL',
            'NUMEQUALTO 2', '> 0',
            'GET baz', '> 4',
            'GET quw', '> 5'
        ]);
        internals = SimpleDB.inspect();
        internals.transactions.should.eql([]);
        internals.transactionIndicesByName.should.eql({});
        internals.db.should.eql({
            foo: '1',
            baz: '4',
            quw: '5'
        });
        internals.currentValues.should.eql({
            foo: '1',
            baz: '4',
            quw: '5'
        });
    });

    it('should rollback a variable to the last transaction value when previous transactions exist', function() {
        var internals;
        processInput([
            'SET foo 2',
            'BEGIN',
            'SET foo 3',
            'BEGIN',
            'SET foo 4',
            'ROLLBACK',
            'GET foo'
        ].join('\n'));
        messages.should.eql([
            'SET foo 2',
            'BEGIN',
            'SET foo 3',
            'BEGIN',
            'SET foo 4',
            'ROLLBACK',
            'GET foo',
            '> 3'
        ]);
        internals = SimpleDB.inspect();
        internals.transactions.should.eql([ { foo: '3' } ]);
        internals.transactionIndicesByName.should.eql({ foo: [ 0 ] });
        internals.db.should.eql({
            foo: '2'
        });
        internals.currentValues.should.eql({
            foo: '3'
        });
    });

    it('should store null when a name is unset within a transaction', function() {
        var internals;
        processInput([ 'SET foo 2', 'BEGIN', 'UNSET foo 3' ].join('\n'));
        messages.should.eql([
            'SET foo 2',
            'BEGIN',
            'UNSET foo 3'
        ]);
        internals = SimpleDB.inspect();
        internals.transactions.should.eql([ { foo: null } ]);
        internals.transactionIndicesByName.should.eql({ foo: [ 0 ] });
        internals.db.should.eql({
            foo: '2'
        });
        internals.currentValues.should.eql({});
    });
});
