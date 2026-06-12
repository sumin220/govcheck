package example;
import java.sql.*;
import java.security.MessageDigest;

public class SampleBad {
    public String name; // S-44: public field

    public void login(String userId, String password) {
        // S-01: SQL injection
        String query = "SELECT * FROM users WHERE id = '" + userId + "'";

        // S-16: Hardcoded password
        String adminPwd = "admin123";

        // S-17: Weak crypto
        MessageDigest md = MessageDigest.getInstance("MD5");

        // S-48: System.exit
        System.exit(0);

        // S-49: String comparison with ==
        if (userId == "admin") { }

        // S-03: OS command injection
        Runtime.getRuntime().exec("cmd " + userId);
    }

    public void process() {
        try {
            riskyOperation();
        } catch (Exception e) {
            // S-34: Empty catch (this catch block is empty)
        }

        try {
            anotherOp();
        } catch (Exception e) {
            // S-35: printStackTrace
            e.printStackTrace();
        }
    }
}
