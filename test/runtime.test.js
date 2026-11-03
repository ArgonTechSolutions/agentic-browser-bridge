import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {Runtime} from '../src/runtime.js';
test('unexpected browser supervisor exit reports failure; deliberate sleep does not',()=>{
 const runtime=new Runtime();let failures=0;runtime.onFailure=()=>failures++;
 const unexpected=new EventEmitter();runtime.watch(unexpected);unexpected.emit('exit',1);assert.equal(failures,1);
 const sleeping=new EventEmitter();runtime.watch(sleeping);runtime.stopping=true;sleeping.emit('exit',0);assert.equal(failures,1);
});
