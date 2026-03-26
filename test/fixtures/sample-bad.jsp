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
</body>
</html>
