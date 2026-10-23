import test from 'node:test';
import assert from 'node:assert/strict';
import {ApiError,isSessionRejected} from '../src/lib/api_error.ts';
test('only rejected or banned sessions log out; temporary API outages retain the session',()=>{
 assert.equal(isSessionRejected(new ApiError('unauthorized',401)),true);
 assert.equal(isSessionRejected(new ApiError('banned',403,'banned')),true);
 for(const error of [new TypeError('Failed to fetch'),new ApiError('unavailable',503),new ApiError('rate_limit',429),new ApiError('forbidden',403),new Error('timeout')])assert.equal(isSessionRejected(error),false);
});
