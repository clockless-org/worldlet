import XCTest
import WorldletKit

/// Bold in an Attention brief shows as bold, not as asterisks, even right against Chinese text (Kelvin, 2026-10-04).
final class InlineMarkdownTests: XCTestCase {
    func shown(_ text: String) -> String {
        strongSegments(text).map { $0.strong ? "<b>" + $0.text + "</b>" : $0.text }.joined()
    }

    func testBoldAgainstChineseAndPunctuation() {
        XCTAssertEqual(shown("**时间：**10月5日下午"), "<b>时间：</b>10月5日下午")
        XCTAssertEqual(shown("请在**周五（10月9日）**前回复"), "请在<b>周五（10月9日）</b>前回复")
        XCTAssertEqual(shown("**“绿卡”**更新了"), "<b>“绿卡”</b>更新了")
        XCTAssertEqual(shown("Pay **$120** by **Friday**."), "Pay <b>$120</b> by <b>Friday</b>.")
        XCTAssertEqual(shown("***both*** here"), "<b>*both*</b> here")
    }

    func testLiteralAsterisksStay() {
        XCTAssertEqual(shown("**unclosed bold"), "**unclosed bold")
        XCTAssertEqual(shown("a ** b ** c"), "a ** b ** c")
        XCTAssertEqual(shown("`a**b**c` x"), "`a**b**c` x")
        XCTAssertEqual(shown("\\*\\*not\\*\\*"), "\\*\\*not\\*\\*")
        XCTAssertEqual(shown("**one\nline**"), "**one\nline**")
        XCTAssertEqual(shown("****"), "****")
    }
}
