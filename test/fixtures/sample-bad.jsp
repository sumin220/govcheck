<%@ page language="java" contentType="text/html; charset=UTF-8" pageEncoding="UTF-8"%>
<html>
<head>
</head>
<body>
  <h1>나쁜 예시 페이지</h1>

  <img src="/images/logo.png">

  <p>${userName}님 환영합니다.</p>
  <p>등록번호: ${registrationNo}</p>

  <form action="/submit" method="post">
    <div>
      <input type="text" id="userId" name="userId">
    </div>
    <div>
      <input type="password" id="userPw" name="userPw">
    </div>
    <button type="submit" onclick="doSubmit()">로그인</button>
  </form>

  <table>
    <thead>
      <tr>
        <td>번호</td>
        <td>이름</td>
        <td>이메일</td>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td>1</td>
        <td>홍길동</td>
        <td>hong@example.go.kr</td>
      </tr>
    </tbody>
  </table>

  <%-- 신규 규칙 위반 샘플 (주석에 outline/color 리터럴 금지) --%>
  <a href="https://example.com" target="_blank">외부 링크</a>
  <style>a:focus { outline: none; }</style>
  <div onclick="location.href='/detail'">클릭 가능한 div</div>
  <select onchange="fnSearch()">
    <option value="1">항목1</option>
  </select>
  <img src="/seoulgallery/common/ckeditor/getImg.do?uniqueId=123" width="1080">
  <a href="/detail"><div class="card-box"><img src="/img.jpg" alt=""></div></a>
  <img alt="" src="/images/decoration.svg">
  <p style="color:#777777">저대비 회색 텍스트</p>
  <div style="background-color:#ffffff">배경색은 오탐되면 안 됨</div>
  <meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=no">
  <video src="/media/intro.mp4"></video>
  <table><caption>회의실</caption><tr><th>이름</th><th>정원</th></tr></table>
  <textarea name="memo"></textarea>
</body>
</html>
