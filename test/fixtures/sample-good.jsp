<%@ page language="java" contentType="text/html; charset=UTF-8" pageEncoding="UTF-8"%>
<%@ taglib prefix="c" uri="http://java.sun.com/jsp/jstl/core"%>
<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <title>좋은 예시 페이지</title>
</head>
<body>
  <a href="#main-content" class="skip-nav">본문 바로가기</a>
  <main id="main-content">
    <h1>공공기관 서비스</h1>

    <img src="/images/logo.png" alt="기관 로고">
    <img src="/images/banner.png" alt="서비스 안내 배너">

    <p><c:out value="${userName}"/>님 환영합니다.</p>
    <p>등록번호: <c:out value="${registrationNo}"/></p>

    <form action="/submit" method="post">
      <div>
        <label for="userId">아이디</label>
        <input type="text" id="userId" name="userId">
      </div>
      <div>
        <label for="userPw">비밀번호</label>
        <input type="password" id="userPw" name="userPw">
      </div>
      <button type="submit">로그인</button>
    </form>

    <table>
      <caption>사용자 목록</caption>
      <thead>
        <tr>
          <th scope="col">번호</th>
          <th scope="col">이름</th>
          <th scope="col">이메일</th>
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
  </main>
</body>
</html>
