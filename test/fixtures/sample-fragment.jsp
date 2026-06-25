<%@ page language="java" contentType="text/html; charset=UTF-8" pageEncoding="UTF-8"%>
<%@ taglib prefix="c" uri="http://java.sun.com/jsp/jstl/core"%>
<%-- Tiles 콘텐츠 조각: 자체 <html> 태그 없음. 실제 <html lang>은 레이아웃이 담당.
     cheerio가 <html>을 합성해도 A-05로 오탐하면 안 됨(조각 false-positive 회귀 가드). --%>
<div class="content">
  <h2>콘텐츠 조각</h2>
  <img src="/img/logo.png" alt="기관 로고">
  <p><c:out value="${msg}"/></p>
</div>
