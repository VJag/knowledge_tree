from app.security import generate_otp_code, hash_otp, new_session_id


def test_hash_otp_is_deterministic():
    assert hash_otp("secret", "123456") == hash_otp("secret", "123456")


def test_hash_otp_trims_code():
    assert hash_otp("secret", "123456") == hash_otp("secret", " 123456 ")


def test_hash_otp_differs_by_secret():
    assert hash_otp("a", "123456") != hash_otp("b", "123456")


def test_generate_otp_code_format():
    code = generate_otp_code()
    assert len(code) == 6
    assert code.isdigit()


def test_new_session_id_unique():
    ids = {new_session_id() for _ in range(20)}
    assert len(ids) == 20
