package example;
import java.sql.*;
import java.security.MessageDigest;
import java.security.SecureRandom;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

public class SampleGood {
    private static final Logger logger = LoggerFactory.getLogger(SampleGood.class);
    private String name;

    public void login(String userId) {
        // Safe: PreparedStatement
        String query = "SELECT * FROM users WHERE id = ?";

        // Safe: SHA-256
        MessageDigest md = MessageDigest.getInstance("SHA-256");

        // Safe: equals method
        if ("admin".equals(userId)) { }
    }

    public void process() {
        try {
            riskyOperation();
        } catch (Exception e) {
            logger.error("Error occurred", e);
        }
    }
}
