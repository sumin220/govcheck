<%@ page language="java" contentType="text/html; charset=UTF-8" pageEncoding="UTF-8"%>
<%@ taglib prefix="c" uri="http://java.sun.com/jsp/jstl/core"%>
<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=yes">
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

    <a href="https://example.com" target="_blank" title="외부 사이트 (새 창 열림)">외부 링크 <span class="visually-hidden">새 창 열림</span></a>
    <button type="button" id="detailBtn" data-href="/detail">클릭 가능한 버튼</button>
    <label for="category">분류 선택</label>
    <select id="category" name="category">
      <option value="1">항목1</option>
    </select>
    <button type="button" id="searchBtn">검색</button>
    <img src="/seoulgallery/common/ckeditor/getImg.do?uniqueId=123" alt="프로그램 안내 포스터" width="1080">
    <a href="/detail" style="display:block"><div class="card-box"><img src="/img.jpg" alt="카드 이미지"></div></a>
    <img alt="" src="/images/decoration.svg" aria-hidden="true">
    <style>a:focus-visible { outline: 2px solid #000; }</style>
    <label for="memo2">메모</label>
    <textarea id="memo2" name="memo2"></textarea>
    <video src="/media/intro.mp4" muted loop></video>
    <table><caption>회의실 목록</caption><tr><th scope="col">이름</th><th scope="col">정원</th></tr></table>
    <%-- A-42 회귀 가드: EL 동적 id는 반복 출력돼도 중복으로 오탐하면 안 됨 --%>
    <ul>
      <c:forEach var="row" items="${rows}" varStatus="st">
        <li id="row-${st.index}"><c:out value="${row.name}"/></li>
      </c:forEach>
      <li id="row-${st.index}">정적 분석상 동일 리터럴이지만 EL이므로 A-42 미발화여야 함</li>
    </ul>
  </main>
</body>
</html>
