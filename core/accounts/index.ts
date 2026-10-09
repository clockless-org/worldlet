/** Public component API: the World's own account connections (Google Mail, Calendar and Drive). Cross-component consumers import this entry point. */
export {GoogleRestError,type GoogleQuery,type GoogleRest,type MailReceipts} from './google/rest.ts';
export {DISCOVERY_QUERIES,MIN_PICTURE_WIDTH,MailText,compactMessage,contentImage,discover,jsonSize,readPage,tidyMail,type MailPage,type MailPicture} from './google/gmail.ts';
export {HtmlParser,unescape as htmlUnescape,type HtmlAttrs} from './google/html-parser.ts';
export {read as readDrive} from './google/drive.ts';
export {readCalendar,readDriveList,googleReadResult} from './google/reads.ts';
export {SEND_SCOPE,address as mailAddress,greeted,prepare as prepareMail,draftHash,reconcile as reconcileMail,send as sendMail} from './google/mail.ts';
export {normalize as normalizeSource,sourceFailure} from './google/normalize.ts';
export {mockGoogle,MOCK_GOOGLE_EMAIL} from './google/mock.ts';
