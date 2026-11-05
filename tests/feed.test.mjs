import test from 'node:test';
import assert from 'node:assert/strict';
import { parseICS, unescapeText, belongsToCity, deduplicate, safeEventURL } from '../scripts/feed-utils.mjs';
const wrap = body => `BEGIN:VCALENDAR\r\nVERSION:2.0\r\n${body}\r\nEND:VCALENDAR`;
const basic = `BEGIN:VEVENT\r\nUID:evt-a@events.lu.ma\r\nSUMMARY:Build\\, learn and connect\r\nDTSTART:20261113T010000Z\r\nDTEND:20261113T030000Z\r\nDESCRIPTION:Get up-to-date information at: https://luma.com/test-event\\nNext line\r\nLOCATION:Vancouver\\, BC\r\nGEO:49.28;-123.12\r\nEND:VEVENT`;

test('Luma feeds: unfolded lines, escaped text, metadata and UTC dates', () => {
  const [event] = parseICS(wrap(basic.replace('connect','con\r\n nect')), 'America/Vancouver');
  assert.equal(event.name, 'Build, learn and connect');
  assert.equal(event.id,'evt-a');
  assert.equal(event.start,'2026-11-13T01:00:00.000Z');
  assert.equal(event.url,'https://luma.com/test-event');
  assert.equal(event.location,'Vancouver, BC');
  assert.equal(event.latitude,49.28);
  assert.equal(unescapeText('A\\;B\\nC\\\\D'),'A;B\nC\\D');
});
test('cancelled events are removed and embedded alarms cannot replace event dates', () => {
  assert.equal(parseICS(wrap(basic.replace('END:VEVENT','STATUS:CANCELLED\r\nEND:VEVENT'))).length,0);
  const alarm = basic.replace('END:VEVENT','BEGIN:VALARM\r\nDTSTART:20260101T000000Z\r\nEND:VALARM\r\nEND:VEVENT');
  assert.equal(parseICS(wrap(alarm))[0].start,'2026-11-13T01:00:00.000Z');
});
test('all-day calendar dates remain intact and the exclusive end date is retained', () => {
  const [event] = parseICS(wrap(basic.replace('DTSTART:20261113T010000Z','DTSTART;VALUE=DATE:20261113').replace('DTEND:20261113T030000Z','DTEND;VALUE=DATE:20261115')),'America/Toronto');
  assert.equal(event.allDay,true); assert.equal(event.date,'20261113');assert.equal(event.endDate,'20261115');
  assert.equal(event.start,'2026-11-13T05:00:00.000Z');
});
test('TZID wall-clock times account for Canadian daylight saving', () => {
  const text=basic.replace('DTSTART:20261113T010000Z','DTSTART;TZID=America/Vancouver:20260713T180000');
  assert.equal(parseICS(wrap(text))[0].start,'2026-07-14T01:00:00.000Z');
});
test('national and global calendars only contribute events in the selected metro', () => {
  const city={latitude:49.2827,longitude:-123.1207,radiusKm:65,aliases:['Vancouver','Burnaby']};
  assert.equal(belongsToCity({latitude:49.25,longitude:-123.0},city,{scope:'global'}),true);
  assert.equal(belongsToCity({latitude:43.65,longitude:-79.38},city,{scope:'global'}),false);
  assert.equal(belongsToCity({location:'Burnaby, BC'},city,{scope:'global'}),true);
  assert.equal(belongsToCity({location:'Online'},city,{scope:'global'}),false);
  assert.equal(belongsToCity({location:'Online'},city,{scope:'local'}),true);
  assert.equal(belongsToCity({location:'San Francisco, CA'},city,{scope:'local'}),false);
  assert.equal(belongsToCity({location:'Location revealed after registration'},city,{scope:'local'}),true);
});
test('the same event on multiple calendars appears once, with all sources', () => {
  const first={name:'Old name',url:'https://luma.com/a',start:'2026-11-13T01:00:00Z',sequence:1,sources:['a'],cover:'image'};
  const second={...first,name:'New name',sequence:2,sources:['b'],cover:null};
  const [event]=deduplicate([first,second]);
  assert.equal(event.name,'New name');assert.deepEqual(event.sources,['a','b']);assert.equal(event.cover,'image');
});
test('unsafe or non-Luma URLs and partial feeds are rejected', () => {
  assert.equal(safeEventURL('javascript:alert(1)'),null);
  assert.equal(safeEventURL('https://luma.com.evil.example/event'),null);
  assert.equal(safeEventURL('https://lu.ma/event?x=1'),'https://luma.com/event');
  assert.throws(()=>parseICS('BEGIN:VCALENDAR'));
});
