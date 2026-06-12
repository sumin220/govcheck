<%@ page language="java" contentType="text/html; charset=UTF-8" pageEncoding="UTF-8"%>
<!DOCTYPE html>
<html lang="ko">
<head><title>A-49 스크립틀릿 skip 가드</title></head>
<body>
  <main>
    <h1>레거시 스크립틀릿 alt — 전부 A-49 미발화여야 함</h1>
    <img src="/img/a.gif" alt="<%=fileNm%>.jpg">
    <img src="/img/b.gif" alt="<%=getAltText()%> 사진">
    <img src="/img/c.gif" alt="이미지 <%=seq%>">
    <img src="/img/real.jpg" alt="hero.jpg">
  </main>
</body>
</html>
