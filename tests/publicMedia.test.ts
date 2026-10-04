import test from 'node:test';
import assert from 'node:assert/strict';
import { publicMediaPath, isPublicMediaPath } from '../src/shared/publicMedia.ts';
test('public images have a working namespace without publishing student documents',()=>{
 assert.equal(publicMediaPath('website_media','campus.png'),'public-media/website_media/campus.png');
 assert.equal(publicMediaPath('website_media','public-media/website_media/campus.png'),'public-media/website_media/campus.png');
 assert.equal(publicMediaPath('documents','student1/passport.pdf'),'student1/passport.pdf');
 assert.equal(isPublicMediaPath('public-media/website_media/campus.png'),true);
 for(const path of ['student1/passport.pdf','public-media/documents/passport.pdf','public-media/website_media/../passport.pdf','public-media/website_media/']) assert.equal(isPublicMediaPath(path),false);
});

test('active HTML and SVG cannot be served as public media',async()=>{
 const {allowedPublicMediaType}=await import('../src/shared/publicMedia.ts');
 assert.equal(allowedPublicMediaType('image/jpeg'),true);
 assert.equal(allowedPublicMediaType('video/mp4'),true);
 assert.equal(allowedPublicMediaType('text/html'),false);
 assert.equal(allowedPublicMediaType('image/svg+xml'),false);
});
