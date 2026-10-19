import XCTest
import WorldletKit

/// Hold-to-talk hears the language the person speaks to Fox, not the app's English (Kelvin, 2026-10-04: speech other
/// than English was misheard on the phone).
final class SpeechLanguageTests: XCTestCase {
    let supported = ["en_US", "en_GB", "zh_CN", "zh_TW", "yue_CN", "ja_JP", "ko_KR", "es_ES", "es_MX", "ru_RU"]

    func testScriptNamesTheLanguage() {
        XCTAssertEqual(SpeechLanguage.language(of: "帮我打开日历"), "zh")
        XCTAssertEqual(SpeechLanguage.language(of: "打开 Gmail 看看"), "zh")
        XCTAssertEqual(SpeechLanguage.language(of: "カレンダーを開いて"), "ja")
        XCTAssertEqual(SpeechLanguage.language(of: "日本語のテスト"), "ja")
        XCTAssertEqual(SpeechLanguage.language(of: "달력 열어줘"), "ko")
        XCTAssertEqual(SpeechLanguage.language(of: "Открой календарь"), "ru")
        XCTAssertNil(SpeechLanguage.language(of: "Open my calendar"))
    }

    func testLastLineDecidesEvenOnAnEnglishPhone() {
        XCTAssertEqual(SpeechLanguage.locale(lines: ["明天有什么安排"], preferred: ["en-US"], supported: supported), "zh-CN")
        XCTAssertEqual(SpeechLanguage.locale(lines: ["明天有什么安排"], preferred: ["en-US", "zh-Hant-TW"], supported: supported), "zh-TW")
        XCTAssertEqual(SpeechLanguage.locale(lines: ["カレンダー"], preferred: ["en-US"], supported: supported), "ja-JP")
    }

    func testOtherwiseThePhonesFirstLanguage() {
        XCTAssertEqual(SpeechLanguage.locale(lines: [], preferred: ["zh-Hans-CN", "en-US"], supported: supported), "zh-CN")
        XCTAssertEqual(SpeechLanguage.locale(lines: ["Open my calendar"], preferred: ["es-MX", "en-US"], supported: supported), "es-MX")
        XCTAssertEqual(SpeechLanguage.locale(lines: [], preferred: ["en-GB"], supported: supported), "en-GB")
        XCTAssertEqual(SpeechLanguage.locale(lines: [], preferred: [], supported: supported), "en-US")
        XCTAssertNil(SpeechLanguage.locale(lines: ["שלום"], preferred: ["en-US"], supported: supported))
    }

    /// Kelvin, 2026-10-12: one English line (or Mandarin heard as English) kept every later hold in English.
    func testAnEnglishLineDoesNotLockOutChinese() {
        XCTAssertEqual(SpeechLanguage.locale(lines: ["明天有什么安排", "ok", "Send it"], preferred: ["en-US"], supported: supported), "zh-CN")
        XCTAssertEqual(SpeechLanguage.locale(lines: ["Send it"], preferred: ["en-US", "zh-Hans-CN"], supported: supported), "zh-CN")
        XCTAssertEqual(SpeechLanguage.locale(lines: [], preferred: ["en-US", "zh-Hant-TW"], supported: supported), "zh-TW")
        XCTAssertEqual(SpeechLanguage.locale(lines: ["明天有什么安排", "Открой календарь"], preferred: ["en-US"], supported: supported), "ru-RU")
        XCTAssertEqual(SpeechLanguage.locale(lines: ["Open my calendar"], preferred: ["en-US", "es-MX"], supported: supported), "en-US")
    }
}
