const { isInCidr } = require('./api/src/lib/ip.js');

console.log('Testing isInCidr:');
console.log('isInCidr(8.8.8.8, 10.0.0.0/8):', isInCidr('8.8.8.8', '10.0.0.0/8'));
console.log('isInCidr(8.8.8.8, 172.16.0.0/12):', isInCidr('8.8.8.8', '172.16.0.0/12'));
console.log('isInCidr(8.8.8.8, 192.168.0.0/16):', isInCidr('8.8.8.8', '192.168.0.0/16'));
console.log('isInCidr(8.8.8.8, 127.0.0.1/32):', isInCidr('8.8.8.8', '127.0.0.1/32'));
console.log('isInCidr(127.0.0.1, 127.0.0.1/32):', isInCidr('127.0.0.1', '127.0.0.1/32'));