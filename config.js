/* 네이버 검색광고 전환 추적.
   네이버 프리미엄 로그분석을 신청하면 1~2영업일 뒤에 공통키(na_account_id, s_로 시작)가 발급됩니다.
   commonKey를 넣기 전까지는 스크립트를 아예 불러오지 않습니다. */
window.PROMOTORS_NAVER_ADS = {
  commonKey: '',
  inflowDomain: 'promotors.kr',
  bookingConversionType: 'lead',
  signupConversionType: 'sign_up'
};

window.PROMOTORS_SUPABASE = {
  url: 'https://ytigiculewerivyytxza.supabase.co',
  anon: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl0aWdpY3VsZXdlcml2eXl0eHphIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM0MDU4OTMsImV4cCI6MjA5ODk4MTg5M30.yZZOE6CA7G9e3Nk0QUTgOgBhXr7GvUl3syrlXayY6A0'
};
