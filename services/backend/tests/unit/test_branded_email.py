"""Every Sheda email uses one branded layout, with a plain-text twin."""

from app.utils.email import branded_email


def test_layout_has_brand_and_link_and_text_twin():
    html, text = branded_email(
        "Offer accepted",
        ['Your offer on "Flat 2" was accepted.'],
        cta_label="See the deal",
        cta_url="https://testing.sheda.app/history",
        footnote="You get these emails because email notifications are on.",
        settings_url="https://testing.sheda.app/notification-setting",
    )
    assert "Revolutionizing real estate operations" in html
    assert "affable, affordable, available, and secure" in html
    assert "#C1272D" in html
    assert 'href="https://testing.sheda.app/history"' in html
    assert "notification-setting" in html
    assert "See the deal: https://testing.sheda.app/history" in text
    assert 'Your offer on "Flat 2" was accepted.' in text


def test_text_people_typed_is_escaped():
    html, _ = branded_email("Offer", ['New offer on "<script>alert(1)</script>"'])
    assert "<script>alert" not in html
    assert "&lt;script&gt;" in html


def test_code_email():
    html, text = branded_email("Your Sheda verification code", ["Use this code."], code="4821", code_note="It expires in 5 minutes.")
    assert "4821" in html and "4821" in text
    assert "It expires in 5 minutes." in text
